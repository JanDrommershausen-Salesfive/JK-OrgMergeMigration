import type {
    DescribeResponse,
    ExcludeRequest,
    MappingRequest,
    ObjectDetail,
    ObjectListResponse,
    OrgsResponse,
    RunEvent,
    RunMode,
    ValueMappingRequest
} from '@studio/shared';
import { conflict } from './errors';
import { DescribeCache } from './orgs/describe';
import { checkPinnedOrg, checkTargetAllowed } from './orgs/safety';
import { checkOrg } from './orgs/status';
import { loadRunConfig, type RunConfig } from './project/runConfig';
import { LastRunStore } from './runs/lastRuns';
import { RunManager } from './runs/runManager';
import { listObjects, objectDetail } from './sfdmu/objects';
import { setFieldExcluded, setFieldMapping, setValueMapping } from './sfdmu/mutations';

// Einstiegspunkt für den Server: bündelt Konfiguration, Läufe und Org-Zugriffe eines Projekts.
export class Studio {
    private readonly describeCache = new DescribeCache();
    private readonly lastRuns: LastRunStore;
    private readonly runs: RunManager;

    private constructor(private readonly config: RunConfig) {
        this.lastRuns = new LastRunStore(config.projectDir);
        this.runs = new RunManager(config.sfdmuDir, this.lastRuns);
    }

    static async open(projectDir: string): Promise<Studio> {
        return new Studio(await loadRunConfig(projectDir));
    }

    async objects(): Promise<ObjectListResponse> {
        return {
            objects: await listObjects(this.config.sfdmuDir, await this.lastRuns.all()),
            running: this.runs.status().running,
            sourceAlias: this.config.sourceAlias,
            targetAlias: this.config.targetAlias
        };
    }

    async object(folder: string): Promise<ObjectDetail> {
        return objectDetail(this.config.sfdmuDir, folder, await this.lastRuns.all());
    }

    async orgs(): Promise<OrgsResponse> {
        const c = this.config;
        const [source, target] = await Promise.all([
            checkOrg(c.sourceAlias, c.expectedSourceId),
            checkOrg(c.targetAlias, c.expectedTargetId)
        ]);
        return { source, target, checkedAt: new Date().toISOString() };
    }

    async describe(folder: string, refresh: boolean): Promise<DescribeResponse> {
        const { object } = await this.object(folder);
        const [source, target] = await Promise.all([
            this.describeCache.describe(this.config.sourceAlias, object, refresh),
            this.describeCache.describe(this.config.targetAlias, object, refresh)
        ]);
        return { source, target };
    }

    async setMapping(req: MappingRequest): Promise<ObjectDetail> {
        this.assertIdle();
        const detail = await this.object(req.folder);
        const target = await this.describeCache.describe(this.config.targetAlias, detail.object);
        await setFieldMapping(this.config.sfdmuDir, detail, req, target);
        return this.object(req.folder);
    }

    async setExcluded(req: ExcludeRequest): Promise<ObjectDetail> {
        this.assertIdle();
        await setFieldExcluded(this.config.sfdmuDir, await this.object(req.folder), req);
        return this.object(req.folder);
    }

    async setValueMapping(req: ValueMappingRequest): Promise<ObjectDetail> {
        this.assertIdle();
        await setValueMapping(this.config.sfdmuDir, await this.object(req.folder), req);
        return this.object(req.folder);
    }

    // Live-Läufe laufen nur, wenn das Ziel eine Sandbox ist und die Orgs den gepinnten IDs entsprechen.
    async startRun(folder: string, mode: RunMode): Promise<void> {
        this.assertIdle();
        await this.object(folder); // unbekannter Ordner → 404
        if (mode === 'live') await this.assertLiveAllowed();
        this.runs.start(folder, mode, this.config.targetAlias);
    }

    stopRun(): void {
        this.runs.stop();
    }

    runStatus() {
        return this.runs.status();
    }

    subscribeRun(listener: (event: RunEvent) => void): () => void {
        return this.runs.subscribe(listener);
    }

    private assertIdle(): void {
        if (this.runs.status().running) {
            throw conflict('Während eines Laufs ist das nicht möglich.');
        }
    }

    private async assertLiveAllowed(): Promise<void> {
        const { source, target } = await this.orgs();
        if (!source.connected || !target.connected) {
            throw conflict('Quelle und Ziel müssen verbunden sein.');
        }
        const pinned = [
            checkPinnedOrg(this.config.expectedSourceId, source.orgId),
            checkPinnedOrg(this.config.expectedTargetId, target.orgId)
        ];
        for (const p of pinned) if (!p.ok) throw conflict(p.reason);
        const safety = checkTargetAllowed({
            source: { alias: source.alias, orgId: source.orgId, isSandbox: source.isSandbox },
            target: { alias: target.alias, orgId: target.orgId, isSandbox: target.isSandbox },
            protectedOrgIds: this.config.protectedOrgIds
        });
        if (!safety.ok) throw conflict(`Live-Lauf blockiert: ${safety.reason}`);
    }
}
