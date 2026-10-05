import type { QuickQueryResult } from '@studio/shared';
import { badRequest } from '../errors';
import { sfQuery, type QueryRunner } from './check';

export const QUICK_QUERY_MAX_ROWS = 5000;

// Nur eine einzelne SELECT-Abfrage. SOQL kennt kein DML, trotzdem wird alles andere abgelehnt (mehrere Anweisungen,
// Kommentare, andere Einleitungen), damit der Editor nie mehr kann als lesen.
export function prepareQuickSoql(input: string): string {
    const soql = input.trim().replace(/\s+/g, ' ');
    if (!/^select\s/i.test(soql)) throw badRequest('Nur SELECT-Abfragen sind erlaubt.');
    if (/[;]|--|\/\*/.test(soql))
        throw badRequest('Nur eine Abfrage ohne Semikolon und Kommentare.');
    if (!/\sfrom\s+\w+/i.test(soql)) throw badRequest('FROM fehlt.');
    return /\slimit\s+\d+\s*$/i.test(soql) ? soql : `${soql} LIMIT ${QUICK_QUERY_MAX_ROWS}`;
}

// Zellen als Text. Relationen werden zu Punktpfaden (Account.Name), "attributes" entfällt.
function flatten(rec: Record<string, unknown>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
        if (k === 'attributes') continue;
        if (v && typeof v === 'object' && !Array.isArray(v))
            Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`));
        else if (Array.isArray(v)) out[`${prefix}${k}`] = `${v.length} Datensätze`;
        else out[`${prefix}${k}`] = v === null || v === undefined ? '' : String(v);
    }
    return out;
}

export async function runQuickQuery(
    alias: string,
    input: string,
    run: QueryRunner = sfQuery
): Promise<QuickQueryResult> {
    const soql = prepareQuickSoql(input);
    const { records, totalSize } = await run(alias, soql);
    const flat = records.map((r) => flatten(r));
    const columns: string[] = [];
    for (const r of flat) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
    return {
        alias,
        soql,
        columns,
        rows: flat.map((r) => columns.map((c) => r[c] ?? '')),
        totalSize,
        truncated: totalSize > records.length
    };
}
