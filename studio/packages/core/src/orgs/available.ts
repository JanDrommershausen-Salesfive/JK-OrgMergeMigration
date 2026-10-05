import type { AvailableOrg } from '@studio/shared';
import { sf } from './sf';

interface SfOrgEntry {
    alias?: string;
    username?: string;
    orgId?: string;
    instanceUrl?: string;
    isSandbox?: boolean;
    isScratch?: boolean;
    connectedStatus?: string;
}

// Fasst die Gruppen aus `sf org list --json` zusammen und entfernt doppelte Benutzer.
export function parseOrgList(result: Record<string, SfOrgEntry[] | undefined>): AvailableOrg[] {
    const byUser = new Map<string, AvailableOrg>();
    for (const group of Object.values(result)) {
        for (const o of Array.isArray(group) ? group : []) {
            if (!o.username || !o.orgId || byUser.has(o.username)) continue;
            byUser.set(o.username, {
                alias: o.alias ?? null,
                username: o.username,
                orgId: o.orgId,
                instanceUrl: o.instanceUrl ?? '',
                isSandbox: !!o.isSandbox,
                isScratch: !!o.isScratch,
                status: o.connectedStatus ?? 'Unbekannt'
            });
        }
    }
    return [...byUser.values()].sort((a, b) =>
        (a.alias ?? a.username).localeCompare(b.alias ?? b.username)
    );
}

export async function listAvailableOrgs(): Promise<AvailableOrg[]> {
    const r = await sf(['org', 'list']);
    if (r.status !== 0 || !r.result) {
        throw new Error(r.message?.split('\n')[0] ?? 'sf org list fehlgeschlagen');
    }
    return parseOrgList(r.result);
}
