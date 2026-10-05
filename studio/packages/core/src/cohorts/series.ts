import type { Cohort, FilterNode } from '@studio/shared';
import { MAX_COHORT_SIZE } from '@studio/shared';
import { badRequest } from '../errors';
import type { QueryRunner } from '../query/check';
import { formatValue, whereText } from '../query/soql';
import { cohortId } from './store';

export const SERIES_LIMIT = 50000;
const CHECK_CHUNK = MAX_COHORT_SIZE;

const quote = (ids: string[]) =>
    formatValue({ kind: 'list', values: ids.map((value) => ({ kind: 'string' as const, value })) });

export function splitIntoBlocks<T>(items: T[], size: number): T[][] {
    const blocks: T[][] = [];
    for (let i = 0; i < items.length; i += size) blocks.push(items.slice(i, i + size));
    return blocks;
}

export const blockCount = (total: number, size: number) => Math.ceil(total / size);

export function seriesWhere(filters: FilterNode[]): string {
    const where = whereText({ filters, rawWhere: null });
    return where ? ` WHERE ${where}` : '';
}

// Zahl der Datensätze, aus denen die Serie entstünde (lesend gegen die Quelle).
export async function countSeriesRecords(opts: {
    rootObject: string;
    filters: FilterNode[];
    sourceAlias: string;
    run: QueryRunner;
}): Promise<number> {
    const r = await opts.run(
        opts.sourceAlias,
        `SELECT COUNT() FROM ${opts.rootObject}${seriesWhere(opts.filters)}`
    );
    return r.totalSize;
}

// Ids der Serie in fester Reihenfolge: nach Erstelldatum, bei gleichem Zeitstempel nach Id (damit die Reihenfolge eindeutig ist).
// Eine eigene Liste behält ihre Reihenfolge und wird auf Existenz in der Quelle geprüft.
export async function resolveSeriesIds(opts: {
    rootObject: string;
    filters: FilterNode[];
    ids?: string[];
    sourceAlias: string;
    run: QueryRunner;
}): Promise<string[]> {
    const { rootObject, sourceAlias, run } = opts;
    if (opts.ids) {
        const unique = [...new Set(opts.ids)];
        const have = new Set<string>();
        for (const chunk of splitIntoBlocks(unique, CHECK_CHUNK)) {
            const found = await run(
                sourceAlias,
                `SELECT Id FROM ${rootObject} WHERE Id IN ${quote(chunk)}`
            );
            found.records.forEach((r) => have.add(String(r.Id).slice(0, 15)));
        }
        const missing = unique.filter((id) => !have.has(id.slice(0, 15)));
        if (missing.length)
            throw badRequest(
                `${missing.length} Ids gibt es in der Quelle nicht (zum Beispiel ${missing[0]}).`
            );
        return unique;
    }
    const found = await run(
        sourceAlias,
        `SELECT Id FROM ${rootObject}${seriesWhere(opts.filters)} ORDER BY CreatedDate, Id LIMIT ${SERIES_LIMIT + 1}`
    );
    if (found.records.length > SERIES_LIMIT)
        throw badRequest(`Mehr als ${SERIES_LIMIT} Datensätze: bitte mit einem Filter eingrenzen.`);
    if (!found.records.length) throw badRequest('Es gibt keine passenden Datensätze.');
    return found.records.map((r) => String(r.Id));
}

const pad = (n: number, total: number) => String(n).padStart(String(total).length, '0');

// Schneidet die Ids in Blöcke und macht aus jedem eine Kohorte. Jede Id steckt in genau einem Block.
export function seriesCohorts(opts: {
    name: string;
    rootObject: string;
    ids: string[];
    blockSize: number;
    filters: FilterNode[];
    seriesId: string;
    now?: Date;
}): Cohort[] {
    const now = opts.now ?? new Date();
    const blocks = splitIntoBlocks(opts.ids, opts.blockSize);
    return blocks.map((ids, i) => {
        const label = `${opts.name} ${pad(i + 1, blocks.length)}/${blocks.length}`;
        return {
            id: cohortId(label, now),
            name: label,
            createdAt: now.toISOString(),
            rootObject: opts.rootObject,
            rule: { kind: 'ids' as const, ids },
            ids,
            count: ids.length,
            series: {
                id: opts.seriesId,
                name: opts.name,
                index: i + 1,
                total: blocks.length,
                filters: opts.filters
            }
        };
    });
}
