import type { DescribeResult, ParentCheck, QueryCheck, QueryModel } from '@studio/shared';
import { sf } from '../orgs/sf';
import { formatValue, whereText } from './soql';

export interface QueryResult {
    records: Record<string, unknown>[];
    totalSize: number;
}

// Führt eine lesende SOQL-Abfrage gegen eine Org aus. Austauschbar für Tests.
export type QueryRunner = (alias: string, soql: string) => Promise<QueryResult>;

export const sfQuery: QueryRunner = async (alias, soql) => {
    const r = await sf(['data', 'query', '-q', soql, '-o', alias], 120_000);
    if (r.status !== 0) {
        const line = (r.message ?? '').split('\n').find((l) => l.trim());
        throw new Error(line?.trim() ?? 'Abfrage fehlgeschlagen');
    }
    return { records: r.result?.records ?? [], totalSize: r.result?.totalSize ?? 0 };
};

const UNQUERYABLE = new Set(['address', 'location']);
const SAMPLE_ROWS = 5;
const GROUP_LIMIT = 2000;
const IN_CHUNK = 100;

const andWhere = (model: QueryModel) => whereText(model);
const withWhere = (base: string, extra?: string) =>
    [base && `(${base})`, extra].filter(Boolean).join(' AND ');
const clause = (where: string) => (where ? ` WHERE ${where}` : '');

// Zellenwert aus einem Datensatz als Text; verschachtelte Objekte (Relationen) werden abgeflacht.
function cell(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return '';
    const s = String(v);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

// Spalten, die Salesforce-IDs enthalten: Id und Lookups. Ohne Describe nur nach dem Namen.
function isIdColumn(column: string, describe: DescribeResult): boolean {
    if (!describe.ok) return column === 'Id' || /Id$/.test(column);
    const type = describe.fields[column]?.type ?? '';
    return type === 'id' || type.startsWith('reference');
}

// Erster Wert eines Aggregat-Ergebnisses (Spaltenname ist je nach Abfrage unterschiedlich).
function firstValue(rec: Record<string, unknown>): string | null {
    for (const [k, v] of Object.entries(rec)) {
        if (k === 'attributes') continue;
        if (v && typeof v === 'object') {
            const inner = firstValue(v as Record<string, unknown>);
            if (inner !== null) return inner;
        } else if (v !== null && v !== undefined) return String(v);
    }
    return null;
}

// Prüft eine Query lesend: Trefferzahl, Beispielzeilen und je Parent, wie viele der referenzierten
// Datensätze im Ziel fehlen. Das entscheidet, ob "nur lesen" reicht oder "mitziehen" nötig ist.
export async function checkQuery(opts: {
    model: QueryModel;
    sourceAlias: string;
    targetAlias: string;
    sourceDescribe: DescribeResult;
    recordBaseUrl?: string | null;
    run?: QueryRunner;
}): Promise<QueryCheck> {
    const { model, sourceAlias, targetAlias, sourceDescribe } = opts;
    const run = opts.run ?? sfQuery;
    const where = andWhere(model);
    const result: QueryCheck = {
        count: null,
        error: null,
        columns: [],
        rows: [],
        idColumns: [],
        recordBaseUrl: opts.recordBaseUrl?.replace(/\/+$/, '') ?? null,
        parents: []
    };

    try {
        result.count = (
            await run(sourceAlias, `SELECT COUNT() FROM ${model.object}${clause(where)}`)
        ).totalSize;
        // Nur Felder, die in der Quelle existieren (SFDMU lässt fehlende aus) und einzeln abfragbar sind.
        const readable = (f: string) =>
            !f.includes('.') &&
            (!sourceDescribe.ok ||
                (!!sourceDescribe.fields[f] &&
                    !UNQUERYABLE.has(sourceDescribe.fields[f]?.baseType ?? '')));
        const columns = model.fields.filter(readable);
        const sample = await run(
            sourceAlias,
            `SELECT ${columns.join(', ')} FROM ${model.object}${clause(where)} LIMIT ${SAMPLE_ROWS}`
        );
        result.columns = columns;
        result.idColumns = columns.filter((c) => isIdColumn(c, sourceDescribe));
        result.rows = sample.records.map((r) => columns.map((c) => cell(r[c])));
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
        return result;
    }

    for (const parent of model.parents) {
        result.parents.push(
            await checkParent(parent, model, where, sourceAlias, targetAlias, sourceDescribe, run)
        );
    }
    return result;
}

async function checkParent(
    parent: QueryModel['parents'][number],
    model: QueryModel,
    where: string,
    sourceAlias: string,
    targetAlias: string,
    describe: DescribeResult,
    run: QueryRunner
): Promise<ParentCheck> {
    const base: ParentCheck = {
        object: parent.object,
        lookupField: null,
        referenced: null,
        existingInTarget: null,
        missing: null,
        note: null
    };
    const ext = parent.externalId;
    if (!ext || ext.includes(';') || ext.includes('.')) {
        return { ...base, note: 'Mehrteilige External ID: Prüfung nicht möglich.' };
    }
    if (!describe.ok) return { ...base, note: 'Describe der Quelle nicht lesbar.' };
    const lookup = model.fields
        .map((f) => [f, describe.fields[f]] as const)
        .find(([, d]) => d?.type === `reference(${parent.object})`);
    const relation = lookup?.[1]?.relationshipName;
    if (!lookup || !relation)
        return { ...base, note: `Kein Lookup auf ${parent.object} in der Query gefunden.` };

    try {
        const lookupField = lookup[0];
        const groups = await run(
            sourceAlias,
            `SELECT ${relation}.${ext} FROM ${model.object}${clause(withWhere(where, `${lookupField} != null`))} GROUP BY ${relation}.${ext} LIMIT ${GROUP_LIMIT}`
        );
        const values = [
            ...new Set(groups.records.map(firstValue).filter((v): v is string => v !== null))
        ];
        let existing = 0;
        for (let i = 0; i < values.length; i += IN_CHUNK) {
            const chunk = values.slice(i, i + IN_CHUNK);
            const list = formatValue({
                kind: 'list',
                values: chunk.map((value) => ({ kind: 'string', value }))
            });
            const found = await run(
                targetAlias,
                `SELECT ${ext} FROM ${parent.object} WHERE ${ext} IN ${list}`
            );
            const have = new Set(found.records.map((r) => String(r[ext] ?? '').toLowerCase()));
            existing += chunk.filter((v) => have.has(v.toLowerCase())).length;
        }
        return {
            object: parent.object,
            lookupField,
            referenced: values.length,
            existingInTarget: existing,
            missing: values.length - existing,
            note:
                groups.records.length >= GROUP_LIMIT
                    ? `Mindestens ${GROUP_LIMIT} verschiedene Werte, Zahlen sind eine Untergrenze.`
                    : null
        };
    } catch (err) {
        return { ...base, note: err instanceof Error ? err.message : String(err) };
    }
}
