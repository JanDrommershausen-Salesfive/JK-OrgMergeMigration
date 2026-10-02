import type { CohortRule } from '@studio/shared';
import { badRequest } from '../errors';
import { formatValue, whereText } from '../query/soql';
import type { QueryRunner } from '../query/check';

const SCAN_LIMIT = 20000;

// Mischt eine Liste reproduzierbar (Mulberry32 mit Startwert).
export function shuffle<T>(items: T[], seed: number): T[] {
    let a = seed >>> 0;
    const rand = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
}

const quoteList = (ids: string[]) =>
    formatValue({ kind: 'list', values: ids.map((value) => ({ kind: 'string' as const, value })) });

// Legt die Ids einer Kohorte fest (lesend gegen die Quelle). 15-stellige Ids werden so übernommen, wie sie sind.
export async function resolveCohortIds(opts: {
    rootObject: string;
    rule: CohortRule;
    sourceAlias: string;
    run: QueryRunner;
    seed?: number;
}): Promise<string[]> {
    const { rootObject, rule, sourceAlias, run } = opts;
    if (rule.kind === 'ids') {
        const unique = [...new Set(rule.ids)];
        const found = await run(
            sourceAlias,
            `SELECT Id FROM ${rootObject} WHERE Id IN ${quoteList(unique)}`
        );
        const have = new Set(found.records.map((r) => String(r.Id).slice(0, 15)));
        const missing = unique.filter((id) => !have.has(id.slice(0, 15)));
        if (missing.length) {
            throw badRequest(
                `${missing.length} Ids gibt es in der Quelle nicht (zum Beispiel ${missing[0]}).`
            );
        }
        return unique;
    }
    const where = whereText({ filters: rule.filters, rawWhere: null });
    const rows = await run(
        sourceAlias,
        `SELECT Id FROM ${rootObject}${where ? ` WHERE ${where}` : ''} ORDER BY Id LIMIT ${SCAN_LIMIT}`
    );
    const ids = rows.records.map((r) => String(r.Id));
    if (!ids.length) throw badRequest('Der Filter trifft keine Datensätze.');
    return shuffle(ids, opts.seed ?? Date.now()).slice(0, rule.size);
}
