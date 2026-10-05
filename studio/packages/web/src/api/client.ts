import {
    AvailableOrgsResponseSchema,
    LimitsResponseSchema,
    PresetDiffSchema,
    PresetInfoSchema,
    PresetListResponseSchema,
    CleanPlanSchema,
    CleanStatusSchema,
    CleanerRulesSchema,
    ChatStatusSchema,
    ProposalSchema,
    QuickQueryResultSchema,
    CohortListResponseSchema,
    ImportTodosResponseSchema,
    TodoItemSchema,
    TodoListResponseSchema,
    type ImportTodosRequest,
    type QuickQueryRequest,
    type SendChatRequest,
    type UpdateTodoRequest,
    CohortPreviewSchema,
    CohortSchema,
    QueryCheckSchema,
    QueryModelSchema,
    DescribeResponseSchema,
    ObjectDetailSchema,
    ObjectListResponseSchema,
    OrgsResponseSchema,
    RunDetailSchema,
    RunListResponseSchema,
    RunLogResponseSchema,
    RunStatusSchema,
    type CleanPlanRequest,
    type CreateCohortRequest,
    type RestorePresetRequest,
    type SavePresetRequest,
    type StartCleanRequest,
    type ExcludeRequest,
    type ParentModeRequest,
    type SaveFiltersRequest,
    type SetFieldsRequest,
    type LoginRequest,
    type MappingRequest,
    type RunMode,
    type SelectOrgsRequest,
    type ValueMappingRequest
} from '@studio/shared';
import { z, type ZodType, type ZodTypeDef } from 'zod';

// Alle Antworten werden gegen das gemeinsame Schema geprüft, Fehlermeldungen kommen vom Server.
async function request<T>(
    url: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    body?: unknown
): Promise<T> {
    const res = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `${url}: HTTP ${res.status}`);
    }
    return schema.parse(await res.json());
}

const enc = encodeURIComponent;

export const api = {
    objects: () => request('/api/objects', ObjectListResponseSchema),
    object: (folder: string, parent?: number) =>
        request(
            `/api/object?folder=${enc(folder)}${parent === undefined ? '' : `&parent=${parent}`}`,
            ObjectDetailSchema
        ),
    describe: (folder: string, refresh = false) =>
        request(
            `/api/describe?folder=${enc(folder)}${refresh ? '&refresh=1' : ''}`,
            DescribeResponseSchema
        ),
    queryModel: (folder: string) => request(`/api/query?folder=${enc(folder)}`, QueryModelSchema),
    saveFilters: (req: SaveFiltersRequest) => request('/api/query/filters', QueryModelSchema, req),
    changeFields: (req: SetFieldsRequest) => request('/api/query/fields', QueryModelSchema, req),
    describeObject: (object: string) =>
        request(`/api/describe/object?object=${enc(object)}`, DescribeResponseSchema),
    setParentMode: (req: ParentModeRequest) => request('/api/query/parent', QueryModelSchema, req),
    checkQuery: (folder: string) => request('/api/query/check', QueryCheckSchema, { folder }),
    orgs: () => request('/api/orgs', OrgsResponseSchema),
    availableOrgs: () => request('/api/orgs/available', AvailableOrgsResponseSchema),
    login: (req: LoginRequest) => request('/api/orgs/login', AvailableOrgsResponseSchema, req),
    selectOrgs: (req: SelectOrgsRequest) =>
        request('/api/orgs/select', ObjectListResponseSchema, req),
    runs: (folder: string) => request(`/api/results?folder=${enc(folder)}`, RunListResponseSchema),
    allRuns: () => request('/api/results/all', RunListResponseSchema),
    runDetail: (folder: string, id: string) =>
        request(`/api/results/run?folder=${enc(folder)}&id=${enc(id)}`, RunDetailSchema),
    runLog: (folder: string, id: string) =>
        request(`/api/results/log?folder=${enc(folder)}&id=${enc(id)}`, RunLogResponseSchema),
    exportUrl: (folder: string, id: string, kind: 'errors' | 'missing-parents') =>
        `/api/results/export?folder=${enc(folder)}&id=${enc(id)}&kind=${kind}`,
    runStatus: () => request('/api/run', RunStatusSchema),
    startRun: (folder: string, mode: RunMode, cohortId?: string, keepFilters?: boolean) =>
        request('/api/run', RunStatusSchema, { folder, mode, cohortId, keepFilters }),
    presets: (folder: string) =>
        request(`/api/presets?folder=${enc(folder)}`, PresetListResponseSchema),
    savePreset: (req: SavePresetRequest) => request('/api/presets', PresetInfoSchema, req),
    presetDiff: (folder: string, id: string) =>
        request(`/api/presets/diff?folder=${enc(folder)}&id=${enc(id)}`, PresetDiffSchema),
    restorePreset: (req: RestorePresetRequest) =>
        request('/api/presets/restore', z.object({ backup: PresetInfoSchema.nullable() }), req),
    deletePreset: async (folder: string, id: string) => {
        const res = await fetch('/api/presets/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder, id })
        });
        if (!res.ok)
            throw new Error(
                ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
                    `HTTP ${res.status}`
            );
    },
    orgLimits: () => request('/api/tools/limits', LimitsResponseSchema),
    cleanerRules: () => request('/api/tools/cleaner/rules', CleanerRulesSchema),
    cleanerStatus: () => request('/api/tools/cleaner/status', CleanStatusSchema),
    cleanerPlan: (req: CleanPlanRequest) =>
        request('/api/tools/cleaner/plan', CleanPlanSchema, req),
    cleanerStart: (req: StartCleanRequest) =>
        request('/api/tools/cleaner/start', CleanStatusSchema, req),
    cleanerReset: async () => {
        const res = await fetch('/api/tools/cleaner/reset', { method: 'POST' });
        if (!res.ok)
            throw new Error(
                ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
                    `HTTP ${res.status}`
            );
    },
    cleanerStop: async () => {
        await fetch('/api/tools/cleaner/stop', { method: 'POST' });
    },
    quickQuery: (req: QuickQueryRequest) =>
        request('/api/tools/query', QuickQueryResultSchema, req),
    chatStatus: () => request('/api/chat', ChatStatusSchema),
    chatSend: (req: SendChatRequest) => request('/api/chat/send', ChatStatusSchema, req),
    applyProposal: (id: string) => request('/api/chat/proposals/apply', ProposalSchema, { id }),
    rejectProposal: (id: string) => request('/api/chat/proposals/reject', ProposalSchema, { id }),
    chatStop: async () => {
        await fetch('/api/chat/stop', { method: 'POST' });
    },
    chatReset: async () => {
        const res = await fetch('/api/chat/reset', { method: 'POST' });
        if (!res.ok)
            throw new Error(
                ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
                    `HTTP ${res.status}`
            );
    },
    todos: () => request('/api/todos', TodoListResponseSchema),
    importTodos: (req: ImportTodosRequest) =>
        request('/api/todos/import', ImportTodosResponseSchema, req),
    updateTodo: (req: UpdateTodoRequest) => request('/api/todos/update', TodoItemSchema, req),
    deleteTodo: async (id: string) => {
        const res = await fetch('/api/todos/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    cohorts: () => request('/api/cohorts', CohortListResponseSchema),
    createCohort: (req: CreateCohortRequest) => request('/api/cohorts', CohortSchema, req),
    deleteCohort: async (id: string) => {
        const res = await fetch('/api/cohorts/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (!res.ok)
            throw new Error(
                ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
                    `HTTP ${res.status}`
            );
    },
    cohortRecords: (id: string) =>
        request(`/api/cohorts/records?id=${enc(id)}`, QuickQueryResultSchema),
    cohortPreview: (id: string) =>
        request(`/api/cohorts/preview?id=${enc(id)}`, CohortPreviewSchema),
    stopRun: async () => {
        await fetch('/api/stop', { method: 'POST' });
    },
    setMapping: (req: MappingRequest) => request('/api/mapping', ObjectDetailSchema, req),
    setExcluded: (req: ExcludeRequest) => request('/api/exclude', ObjectDetailSchema, req),
    setValueMapping: (req: ValueMappingRequest) =>
        request('/api/valuemapping', ObjectDetailSchema, req)
};
