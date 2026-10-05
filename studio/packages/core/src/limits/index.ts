import type { LimitLevel, OrgLimit, OrgLimits } from '@studio/shared';
import { sf, type SfRunner } from '../orgs/sf';

// Die Limits, die für Migration und Löschen eine Rolle spielen (Quelle: sf limits api display).
const WATCHED: { key: string; label: string; unit: string; hint: string }[] = [
    {
        key: 'DailyApiRequests',
        label: 'API-Aufrufe (24 h)',
        unit: 'Aufrufe',
        hint: 'Jede Abfrage, jedes Describe und jeder SFDMU-Lauf zählt. In der Quelle ist das Budget klein, dort belasten Läufe und Kohorten-Vorschauen es.'
    },
    {
        key: 'DailyBulkApiBatches',
        label: 'Bulk-API-Batches (24 h)',
        unit: 'Batches',
        hint: 'Jeder Schreib- und Löschauftrag verbraucht Batches (10.000 Datensätze je Batch), geteilt zwischen Bulk API und Bulk API 2.0.'
    },
    {
        key: 'DataStorageMB',
        label: 'Datenspeicher',
        unit: 'MB',
        hint: 'Belegt von allen Datensätzen. Der Papierkorb zählt nicht mit.'
    },
    {
        key: 'FileStorageMB',
        label: 'Dateispeicher',
        unit: 'MB',
        hint: 'Wird von ContentVersion und Anhängen belegt, in Sandboxes oft das engste Limit.'
    }
];

// Ab diesem Anteil gilt ein Limit als knapp (warn) bzw. fast erschöpft (crit).
const WARN = 80;
const CRIT = 95;

export const levelOf = (percentUsed: number): LimitLevel =>
    percentUsed >= CRIT ? 'crit' : percentUsed >= WARN ? 'warn' : 'ok';

export function parseLimits(rows: { name: string; max: number; remaining: number }[]): OrgLimit[] {
    return WATCHED.flatMap((w) => {
        const row = rows.find((r) => r.name === w.key);
        if (!row || !row.max) return [];
        const used = row.max - row.remaining;
        const percentUsed = Math.round((used / row.max) * 1000) / 10;
        return [
            {
                ...w,
                max: row.max,
                remaining: row.remaining,
                used,
                percentUsed,
                level: levelOf(percentUsed)
            }
        ];
    });
}

// Liest die Limits einer Org mit einem einzigen API-Aufruf.
export async function readOrgLimits(
    role: OrgLimits['role'],
    alias: string,
    run: SfRunner = sf
): Promise<OrgLimits> {
    const r = await run(['limits', 'api', 'display', '-o', alias]);
    if (r.status !== 0 || !Array.isArray(r.result)) {
        const line = (r.message ?? 'Limits nicht lesbar').split('\n').find((l) => l.trim());
        return { role, alias, limits: [], error: line?.trim() ?? 'Limits nicht lesbar' };
    }
    return { role, alias, limits: parseLimits(r.result), error: null };
}
