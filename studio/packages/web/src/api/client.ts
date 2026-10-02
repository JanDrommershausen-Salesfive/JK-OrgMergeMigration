import {
    AvailableOrgsResponseSchema,
    DescribeResponseSchema,
    ObjectDetailSchema,
    ObjectListResponseSchema,
    OrgsResponseSchema,
    RunStatusSchema,
    type ExcludeRequest,
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
    object: (folder: string) => request(`/api/object?folder=${enc(folder)}`, ObjectDetailSchema),
    describe: (folder: string, refresh = false) =>
        request(
            `/api/describe?folder=${enc(folder)}${refresh ? '&refresh=1' : ''}`,
            DescribeResponseSchema
        ),
    orgs: () => request('/api/orgs', OrgsResponseSchema),
    availableOrgs: () => request('/api/orgs/available', AvailableOrgsResponseSchema),
    login: (req: LoginRequest) => request('/api/orgs/login', AvailableOrgsResponseSchema, req),
    selectOrgs: (req: SelectOrgsRequest) =>
        request('/api/orgs/select', ObjectListResponseSchema, req),
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
