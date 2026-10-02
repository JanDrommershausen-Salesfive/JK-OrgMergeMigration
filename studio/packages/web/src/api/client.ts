import {
    AvailableOrgsResponseSchema,
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
import type { ZodType } from 'zod';

// Alle Antworten werden gegen das gemeinsame Schema geprüft, Fehlermeldungen kommen vom Server.
async function request<T>(url: string, schema: ZodType<T>, body?: unknown): Promise<T> {
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
    startRun: (folder: string, mode: RunMode) =>
        request('/api/run', RunStatusSchema, { folder, mode }),
    stopRun: async () => {
        await fetch('/api/stop', { method: 'POST' });
    },
    setMapping: (req: MappingRequest) => request('/api/mapping', ObjectDetailSchema, req),
    setExcluded: (req: ExcludeRequest) => request('/api/exclude', ObjectDetailSchema, req),
    setValueMapping: (req: ValueMappingRequest) =>
        request('/api/valuemapping', ObjectDetailSchema, req)
};
