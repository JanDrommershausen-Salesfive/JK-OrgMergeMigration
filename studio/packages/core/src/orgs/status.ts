import type { OrgStatus } from '@studio/shared';
import { sf } from './sf';

const firstLine = (s: string) => s.split('\n')[0] ?? s;

// Echter API-Aufruf (nicht nur die gecachte Anmeldedatei), damit ein abgelaufenes Token als "nicht verbunden" erscheint.
export async function checkOrg(alias: string, expectedId: string): Promise<OrgStatus> {
    const [q, display] = await Promise.all([
        sf([
            'data',
            'query',
            '-q',
            'SELECT Id, Name, IsSandbox, InstanceName FROM Organization',
            '-o',
            alias
        ]),
        sf(['org', 'display', '-o', alias])
    ]);
    const rec = q.status === 0 ? q.result?.records?.[0] : undefined;
    const d = display.status === 0 ? (display.result ?? {}) : {};
    const instanceUrl: string | null = d.instanceUrl ?? null;
    const username: string | null = d.username ?? null;
    if (!rec) {
        return {
            connected: false,
            alias,
            error: firstLine(q.message || 'Nicht erreichbar'),
            instanceUrl,
            username
        };
    }
    const id: string = rec.Id;
    return {
        connected: true,
        alias,
        orgId: id,
        name: rec.Name,
        isSandbox: rec.IsSandbox,
        instance: rec.InstanceName,
        instanceUrl,
        username,
        idMatches: !expectedId || id.startsWith(expectedId) || expectedId.startsWith(id)
    };
}
