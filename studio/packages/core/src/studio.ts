import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type {
    AvailableOrgsResponse,
    CleanEvent,
    CleanPlan,
    CleanPlanRequest,
    StartCleanRequest,
    Cohort,
    CohortListResponse,
    CohortPreview,
    CreateCohortRequest,
    DescribeResponse,
    ExcludeRequest,
    LoginRequest,
    MappingRequest,
    ObjectDetail,
    ObjectListResponse,
    ParentModeRequest,
    QueryCheck,
    QueryModel,
    ProjectConfig,
    OrgsResponse,
    RunDetail,
    RunListResponse,
    RunEvent,
    RunMode,
    SaveFiltersRequest,
    SetFieldsRequest,
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
import {
    ROOT_OBJECT,
    CohortStore,
    applyCohort,
    cohortId,
    cohortPreview,
    linksFor,
    resolveCohortIds
} from './cohorts';
import {
    CleanerManager,
    buildPlan,
    executePlan,
    loadCleanerRules,
    type ChildRelation
} from './cleaner';
import { sf } from './orgs/sf';
import { checkQuery, sfQuery } from './query/check';
import { objectOf, targetObject } from './sfdmu/exportConfig';
import { listFolders, readExport } from './sfdmu/exportConfig';
import { writeFileAtomic } from './util/fs';
import { changeFields, queryModel, saveFilters, setParentMode } from './query/model';
import { RunManager } from './runs/runManager';
import { archiveRun } from './results/archive';
import { ResultStore } from './results/store';
import { toCsv } from './sfdmu/csv';
import { listObjects, objectDetail } from './sfdmu/objects';
import { setFieldExcluded, setFieldMapping, setValueMapping } from './sfdmu/mutations';

// Einstiegspunkt für den Server: bündelt Konfiguration, Läufe und Org-Zugriffe eines Projekts.
export class Studio {
    private describeCache = new DescribeCache();
    private readonly lastRuns: LastRunStore;
    private runs: RunManager;
    private readonly results: ResultStore;
    private readonly cohorts: CohortStore;
    private readonly cleaner: CleanerManager;
    private loginInProgress = false;

    private constructor(private config: RunConfig) {
        this.lastRuns = new LastRunStore(config.projectDir);
        this.results = new ResultStore(config.projectDir);
        this.cohorts = new CohortStore(config.projectDir);
        this.cleaner = new CleanerManager(config.projectDir);
        this.runs = new RunManager(config.sfdmuDir, this.lastRuns, async (end) => {
            const c = this.config;
            const { object } = await this.object(end.folder);
            return archiveRun({
                ...end,
                projectDir: c.projectDir,
                sfdmuDir: c.sfdmuDir,
                object,
                sourceAlias: c.source?.alias ?? '',
                targetAlias: c.target?.alias ?? ''
            });
        });
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

    async object(folder: string, parentIndex?: number): Promise<ObjectDetail> {
        return objectDetail(this.config.sfdmuDir, folder, await this.lastRuns.all(), parentIndex);
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
        const detail = await this.object(req.folder, req.parentIndex);
        const target = await this.describeCache.describe(
            this.requireOrgs().target.alias,
            detail.object
        );
        await setFieldMapping(this.config.sfdmuDir, detail, req, target);
        return this.object(req.folder, req.parentIndex);
    }

    async setExcluded(req: ExcludeRequest): Promise<ObjectDetail> {
        this.assertIdle();
        await setFieldExcluded(
            this.config.sfdmuDir,
            await this.object(req.folder, req.parentIndex),
            req
        );
        return this.object(req.folder, req.parentIndex);
    }

    async setValueMapping(req: ValueMappingRequest): Promise<ObjectDetail> {
        this.assertIdle();
        await setValueMapping(
            this.config.sfdmuDir,
            await this.object(req.folder, req.parentIndex),
            req
        );
        return this.object(req.folder, req.parentIndex);
    }

    // Live-Läufe laufen nur, wenn das Ziel eine Sandbox ist und die Orgs den gepinnten IDs entsprechen.
    async startRun(
        folder: string,
        mode: RunMode,
        cohortId?: string,
        keepFilters = false
    ): Promise<void> {
        this.assertIdle();
        await this.object(folder); // unbekannter Ordner → 404
        if (mode === 'live') await this.assertLiveAllowed();
        const options = cohortId ? await this.cohortRunOptions(folder, cohortId, keepFilters) : {};
        this.runs.start(folder, mode, this.requireOrgs().target.alias, options);
    }

    // Erzeugt die Konfiguration für einen Lauf auf eine Kohorte (die gespeicherte export.json bleibt unberührt).
    private async cohortRunOptions(folder: string, id: string, keepFilters: boolean) {
        const cohort = await this.cohorts.get(id);
        const config = await readExport(this.config.sfdmuDir, folder);
        const scope = applyCohort(config, cohort, await linksFor(config, this.sourceLookups()), {
            keepFilters
        });
        if (!scope.scoped) {
            throw conflict(
                `${folder} folgt der Kohorte nicht. ${scope.notes[0] ?? ''} Starte ohne Kohorte, wenn das gewollt ist.`.trim()
            );
        }
        const dir = path.join(this.config.projectDir, 'runs', '.effective');
        await mkdir(dir, { recursive: true });
        const exportFile = path.join(dir, `${folder}.json`);
        await writeFileAtomic(exportFile, JSON.stringify(scope.config, null, 2) + '\n');
        return { exportFile, cohort: { id: cohort.id, name: cohort.name, count: cohort.count } };
    }

    private sourceLookups() {
        const alias = this.requireOrgs().source.alias;
        return async (object: string) => {
            const d = await this.describeCache.describe(alias, object);
            return d.ok ? d.fields : null;
        };
    }

    async listCohorts(): Promise<CohortListResponse> {
        return { cohorts: await this.cohorts.list() };
    }

    // Zieht die Root-Datensätze lesend aus der Quelle und friert die Ids ein.
    async createCohort(req: CreateCohortRequest): Promise<Cohort> {
        const { source } = this.requireOrgs();
        const ids = await resolveCohortIds({
            rootObject: ROOT_OBJECT,
            rule: req.rule,
            sourceAlias: source.alias,
            run: sfQuery
        });
        const cohort: Cohort = {
            id: cohortId(req.name),
            name: req.name,
            createdAt: new Date().toISOString(),
            rootObject: ROOT_OBJECT,
            rule: req.rule,
            ids,
            count: ids.length
        };
        await this.cohorts.save(cohort);
        return cohort;
    }

    async deleteCohort(id: string): Promise<void> {
        await this.cohorts.delete(id);
    }

    async cohortPreview(id: string): Promise<CohortPreview> {
        const cohort = await this.cohorts.get(id);
        const configs = await Promise.all(
            listFolders(this.config.sfdmuDir).map(async (folder) => ({
                folder,
                config: await readExport(this.config.sfdmuDir, folder)
            }))
        );
        return cohortPreview({
            cohort,
            configs,
            lookups: this.sourceLookups(),
            run: sfQuery,
            sourceAlias: this.requireOrgs().source.alias
        });
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

    async queryModel(folder: string): Promise<QueryModel> {
        return queryModel(this.config.sfdmuDir, folder);
    }

    async saveFilters(req: SaveFiltersRequest): Promise<QueryModel> {
        this.assertIdle();
        await saveFilters(this.config.sfdmuDir, req.folder, req);
        return this.queryModel(req.folder);
    }

    async changeQueryFields(req: SetFieldsRequest): Promise<QueryModel> {
        this.assertIdle();
        const model = await this.queryModel(req.folder);
        const parent = req.parentIndex === undefined ? null : model.parents[req.parentIndex];
        if (req.parentIndex !== undefined && !parent)
            throw badRequest('Unbekannter Parent-Eintrag.');
        const object = parent ? parent.object : model.object;
        const source = await this.describeCache.describe(this.requireOrgs().source.alias, object);
        await changeFields(this.config.sfdmuDir, req.folder, req, source);
        return this.queryModel(req.folder);
    }

    // Describe für ein beliebiges Objekt (zum Beispiel einen Parent), nicht nur das Zielobjekt eines Ordners.
    async describeObject(object: string): Promise<DescribeResponse> {
        if (!/^\w+$/.test(object)) throw badRequest('Ungültiger Objektname.');
        const { source, target } = this.requireOrgs();
        const [src, tgt] = await Promise.all([
            this.describeCache.describe(source.alias, object),
            this.describeCache.describe(target.alias, object)
        ]);
        return { source: src, target: tgt };
    }

    async setParentMode(req: ParentModeRequest): Promise<QueryModel> {
        this.assertIdle();
        await setParentMode(this.config.sfdmuDir, req.folder, req.index, req.mode);
        return this.queryModel(req.folder);
    }

    // Lesende Prüfung gegen Quelle und Ziel: Treffer, Beispielzeilen, fehlende Parents.
    async checkQuery(folder: string): Promise<QueryCheck> {
        const model = await this.queryModel(folder);
        const { source, target } = this.requireOrgs();
        return checkQuery({
            model,
            sourceAlias: source.alias,
            targetAlias: target.alias,
            sourceDescribe: await this.describeCache.describe(source.alias, model.object)
        });
    }

    // --- Org Cleaner (löscht Daten in der Ziel-Sandbox) ---

    // Löschen ist nur in der gepinnten Ziel-Org erlaubt, und nur wenn sie eine Sandbox ist und nicht als geschützt gilt.
    private async assertCleanAllowed(): Promise<{ alias: string; username: string }> {
        const { source, target } = await this.orgs();
        if (!source.connected || !target.connected)
            throw conflict('Quelle und Ziel müssen verbunden sein.');
        const pins = this.requireOrgs();
        for (const p of [
            checkPinnedOrg(pins.source.orgId, source.orgId),
            checkPinnedOrg(pins.target.orgId, target.orgId)
        ]) {
            if (!p.ok) throw conflict(p.reason);
        }
        const safety = checkTargetAllowed({
            source: { alias: source.alias, orgId: source.orgId, isSandbox: source.isSandbox },
            target: { alias: target.alias, orgId: target.orgId, isSandbox: target.isSandbox },
            protectedOrgIds: this.config.protectedOrgIds
        });
        if (!safety.ok) throw conflict(`Löschen blockiert: ${safety.reason}`);
        return { alias: target.alias, username: target.username ?? '' };
    }

    private async migrationObjects(): Promise<string[]> {
        const out: string[] = [];
        for (const f of listFolders(this.config.sfdmuDir)) {
            out.push(objectOf(targetObject(await readExport(this.config.sfdmuDir, f))));
        }
        return out;
    }

    private async buildCleanPlan(req: CleanPlanRequest): Promise<CleanPlan> {
        const { alias, username } = await this.assertCleanAllowed();
        const userRows = await sfQuery(
            alias,
            `SELECT Id FROM User WHERE Username = '${username.replace(/'/g, "\\'")}'`
        );
        const userId = String(userRows.records[0]?.Id ?? '');
        if (!userId) throw conflict(`Benutzer ${username} in ${alias} nicht gefunden.`);

        const childCache = new Map<string, ChildRelation[]>();
        return buildPlan({
            request: req,
            migrationObjects: await this.migrationObjects(),
            rules: await loadCleanerRules(this.config.projectDir),
            alias,
            username,
            userId,
            deps: {
                count: async (soql) => (await sfQuery(alias, soql)).totalSize,
                children: async (object) => {
                    const hit = childCache.get(object);
                    if (hit) return hit;
                    const r = await sf(['sobject', 'describe', '-s', object, '-o', alias], 120_000);
                    if (r.status !== 0) throw new Error(r.message ?? 'Describe fehlgeschlagen');
                    const rels: ChildRelation[] = (r.result?.childRelationships ?? []).map(
                        (c: ChildRelation) => ({
                            childSObject: c.childSObject,
                            field: c.field,
                            restrictedDelete: !!c.restrictedDelete,
                            cascadeDelete: !!c.cascadeDelete
                        })
                    );
                    childCache.set(object, rels);
                    return rels;
                },
                activatedOrderStatuses: async () =>
                    (
                        await sfQuery(
                            alias,
                            "SELECT ApiName FROM OrderStatus WHERE StatusCode = 'Activated'"
                        ).catch(() => ({ records: [] }))
                    ).records.map((x) => String(x.ApiName))
            }
        });
    }

    async cleanerRules() {
        return loadCleanerRules(this.config.projectDir);
    }

    async cleanerPlan(req: CleanPlanRequest): Promise<CleanPlan> {
        return this.buildCleanPlan(req);
    }

    cleanerRunning(): boolean {
        return this.cleaner.running;
    }

    // Startet das Löschen. Der Plan wird frisch berechnet (nicht aus der Anfrage übernommen), der Alias muss eingetippt sein.
    async startCleaner(req: StartCleanRequest): Promise<void> {
        this.assertIdle();
        const { alias } = await this.assertCleanAllowed();
        if (req.confirm !== alias) throw conflict(`Zur Bestätigung den Alias ${alias} eingeben.`);
        const plan = await this.buildCleanPlan(req);
        this.cleaner.start((ctx) =>
            executePlan({
                plan,
                alias,
                hardDelete: req.hardDelete,
                run: sfQuery,
                sf,
                workDir: ctx.workDir,
                emit: ctx.emit,
                isStopped: ctx.isStopped
            })
        );
    }

    stopCleaner(): void {
        this.cleaner.stop();
    }

    subscribeCleaner(listener: (e: CleanEvent) => void): () => void {
        return this.cleaner.subscribe(listener);
    }

    async runResults(folder: string): Promise<RunListResponse> {
        await this.object(folder); // unbekannter Ordner → 404
        return { runs: await this.results.list(folder) };
    }

    async allRuns(): Promise<RunListResponse> {
        return { runs: await this.results.listAll() };
    }

    async runDetail(folder: string, id: string): Promise<RunDetail> {
        return this.results.detail(folder, id);
    }

    async runLog(folder: string, id: string): Promise<string> {
        return this.results.log(folder, id);
    }

    // CSV für Excel (UTF-8 mit BOM) mit allen Fehlern bzw. fehlenden Parents eines Laufs.
    async exportRun(folder: string, id: string, kind: 'errors' | 'missing-parents') {
        const { errors, missing } = await this.results.tables(folder, id);
        const rows =
            kind === 'errors'
                ? [
                      ['Datei', 'Id', 'Old Id', 'Bezeichnung', 'Fehler'],
                      ...errors.map((e) => [e.file, e.id, e.oldId, e.label, e.error])
                  ]
                : [
                      ['Lookup-Feld', 'Parent-Objekt', 'Fehlender Wert', 'Record Id', 'Objekt'],
                      ...missing.rows.map((r) => [
                          r.lookupField,
                          r.parentObject,
                          r.value,
                          r.recordId,
                          r.object
                      ])
                  ];
        return { filename: `${folder}_${id}_${kind}.csv`, text: '\uFEFF' + toCsv(rows, true) };
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
        if (this.runs.status().running || this.cleaner.running) {
            throw conflict('Während eines Laufs oder Löschauftrags ist das nicht möglich.');
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
