import path from 'node:path';
import type {
    AvailableOrgsResponse,
    DescribeResponse,
    ExcludeRequest,
    LoginRequest,
    MappingRequest,
    ObjectDetail,
    ObjectListResponse,
    ProjectConfig,
    OrgsResponse,
    RunEvent,
    RunMode,
    SelectOrgsRequest,
    ValueMappingRequest
} from '@studio/shared';
import { badRequest, conflict } from './errors';
import { DescribeCache } from './orgs/describe';
import { listAvailableOrgs } from './orgs/available';
import { loginOrg } from './orgs/login';
import { checkPinnedOrg, checkTargetAllowed } from './orgs/safety';
import { checkOrg } from './orgs/status';
import {
    fromProject,
    loadRunConfig,
    realPath,
    type OrgPin,
    type RunConfig
} from './project/runConfig';
import { saveProject } from './project/save';
import { LastRunStore } from './runs/lastRuns';
import { RunManager } from './runs/runManager';
import { listObjects, objectDetail } from './sfdmu/objects';
import { setFieldExcluded, setFieldMapping, setValueMapping } from './sfdmu/mutations';

// Einstiegspunkt für den Server: bündelt Konfiguration, Läufe und Org-Zugriffe eines Projekts.
export class Studio {
    private describeCache = new DescribeCache();
    private readonly lastRuns: LastRunStore;
    private runs: RunManager;
    private loginInProgress = false;

    private constructor(private config: RunConfig) {
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
            configured: this.config.source !== null && this.config.target !== null,
            staleProjectPath: this.config.staleProjectPath,
            sourceAlias: this.config.source?.alias ?? '',
            targetAlias: this.config.target?.alias ?? ''
        };
    }

    async object(folder: string): Promise<ObjectDetail> {
        return objectDetail(this.config.sfdmuDir, folder, await this.lastRuns.all());
    }

    async orgs(): Promise<OrgsResponse> {
        const { source: s, target: t } = this.requireOrgs();
        const [source, target] = await Promise.all([
            checkOrg(s.alias, s.orgId),
            checkOrg(t.alias, t.orgId)
        ]);
        return { source, target, checkedAt: new Date().toISOString() };
    }

    async describe(folder: string, refresh: boolean): Promise<DescribeResponse> {
        const { object } = await this.object(folder);
        const { source: s, target: t } = this.requireOrgs();
        const [source, target] = await Promise.all([
            this.describeCache.describe(s.alias, object, refresh),
            this.describeCache.describe(t.alias, object, refresh)
        ]);
        return { source, target };
    }

    async setMapping(req: MappingRequest): Promise<ObjectDetail> {
        this.assertIdle();
        const detail = await this.object(req.folder);
        const target = await this.describeCache.describe(
            this.requireOrgs().target.alias,
            detail.object
        );
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
        this.runs.start(folder, mode, this.requireOrgs().target.alias);
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

    async availableOrgs(): Promise<AvailableOrgsResponse> {
        return { orgs: await listAvailableOrgs() };
    }

    // Meldet eine Org per Browser an. Nur ein Login zugleich.
    async login(req: LoginRequest): Promise<AvailableOrgsResponse> {
        if (this.loginInProgress) throw conflict('Es läuft bereits ein Login.');
        this.loginInProgress = true;
        try {
            await loginOrg(req);
        } finally {
            this.loginInProgress = false;
        }
        return this.availableOrgs();
    }

    // Legt Quelle und Ziel fest und pinnt deren Org-IDs in migration.project.json.
    // run.sh vergleicht bei jedem Lauf die aufgelösten Orgs mit diesen IDs.
    async selectOrgs({ sourceAlias, targetAlias }: SelectOrgsRequest): Promise<ObjectListResponse> {
        this.assertIdle();
        const [source, target] = await Promise.all([
            checkOrg(sourceAlias, ''),
            checkOrg(targetAlias, '')
        ]);
        for (const org of [source, target]) {
            if (!org.connected) throw badRequest(`${org.alias} ist nicht verbunden: ${org.error}`);
        }
        if (!source.connected || !target.connected) return this.objects(); // für den Typ-Narrowing

        // Eine Produktivquelle ist ab jetzt als Ziel gesperrt.
        const protectedOrgIds = new Set(this.config.protectedOrgIds);
        if (!source.isSandbox) protectedOrgIds.add(source.orgId);
        const safety = checkTargetAllowed({
            source: { alias: source.alias, orgId: source.orgId, isSandbox: source.isSandbox },
            target: { alias: target.alias, orgId: target.orgId, isSandbox: target.isSandbox },
            protectedOrgIds: [...protectedOrgIds]
        });
        if (!safety.ok) throw badRequest(`Auswahl nicht möglich: ${safety.reason}`);

        const project: ProjectConfig = {
            name: this.config.name ?? `${source.alias} → ${target.alias}`,
            source: { alias: source.alias, orgId: source.orgId },
            target: { alias: target.alias, orgId: target.orgId },
            protectedOrgIds: [...protectedOrgIds],
            projectPath: realPath(this.config.projectDir),
            objectsDir: this.relativeObjectsDir(),
            docsDir: this.config.docsDir
        };
        await saveProject(this.config.projectDir, project);
        this.config = fromProject(this.config.projectDir, project);
        this.describeCache = new DescribeCache();
        return this.objects();
    }

    private relativeObjectsDir(): string {
        return path.relative(this.config.projectDir, this.config.sfdmuDir) || 'sfdmu';
    }

    private requireOrgs(): { source: OrgPin; target: OrgPin } {
        const { source, target } = this.config;
        if (!source || !target) throw conflict('Noch keine Orgs ausgewählt.');
        return { source, target };
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
        const pins = this.requireOrgs();
        const pinned = [
            checkPinnedOrg(pins.source.orgId, source.orgId),
            checkPinnedOrg(pins.target.orgId, target.orgId)
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
