import { classifyError } from '@studio/core';
import type { DescribeResponse, ObjectDetail, RunDetail, TodoItem } from '@studio/shared';

// Fehlerlisten ohne Datensatzinhalte: gleiche Fehler zusammengefasst, ohne Bezeichnungen und Ids.
export function summarizeRun({
    meta,
    errors,
    errorsTotal,
    missingParentGroups,
    missingParentsTotal
}: RunDetail) {
    const groups = new Map<
        string,
        { category: string; field: string | null; message: string; count: number }
    >();
    for (const e of errors) {
        const c = classifyError(e.error);
        const key = `${c.category}|${c.field ?? ''}|${c.message}`;
        const g = groups.get(key) ?? {
            category: c.category,
            field: c.field,
            message: c.message,
            count: 0
        };
        g.count++;
        groups.set(key, g);
    }
    const byLookup = new Map<string, number>();
    for (const g of missingParentGroups) {
        const key = `${g.lookupField} -> ${g.parentObject}`;
        byLookup.set(key, (byLookup.get(key) ?? 0) + g.records);
    }
    return {
        run: {
            id: meta.id,
            object: meta.object,
            mode: meta.mode,
            startedAt: meta.startedAt,
            durationMs: meta.durationMs,
            ok: meta.ok,
            stopped: meta.stopped,
            source: meta.sourceAlias,
            target: meta.targetAlias,
            cohort: meta.cohort?.name ?? null
        },
        counts: meta.counts,
        summary: meta.summary,
        warnings: meta.warnings,
        errorGroups: [...groups.values()].sort((a, b) => b.count - a.count),
        errorsTotal,
        errorsAnalysed: errors.length, // die GUI lädt höchstens eine begrenzte Zahl Zeilen
        missingParents: [...byLookup].map(([lookup, records]) => ({ lookup, records })),
        missingParentsTotal
    };
}

// Vergleich Quelle gegen Ziel je Query-Feld, kompakt statt der kompletten Describe-Daten.
export function compareFields(detail: ObjectDetail, describe: DescribeResponse) {
    if (!describe.target.ok) return { error: `Ziel nicht lesbar: ${describe.target.error}` };
    const source = describe.source.ok ? describe.source.fields : null;
    const target = describe.target.fields;
    const covered = new Set(
        detail.fields.filter((f) => !f.excluded).map((f) => f.targetField.toLowerCase())
    );
    return {
        object: detail.object,
        sourceReadable: source !== null,
        fields: detail.fields.map((f) => {
            const s = source?.[f.name];
            const t = target[f.targetField];
            return {
                name: f.name,
                targetField: f.targetField,
                excluded: f.excluded,
                valueMapped: f.valueMapped,
                sourceType: s?.type ?? (source ? 'fehlt in Quelle' : null),
                targetType: t?.type ?? 'fehlt im Ziel',
                targetWritable: t ? t.createable : null
            };
        }),
        requiredTargetFieldsWithoutSource: Object.entries(target)
            .filter(([n, f]) => f.required && f.createable && !covered.has(n.toLowerCase()))
            .map(([n, f]) => ({ name: n, type: f.type }))
    };
}

// To-Dos ohne Beispiele (die enthalten Kundennamen).
export const todoView = (t: TodoItem) => ({
    id: t.id,
    object: t.object,
    category: t.category,
    field: t.field,
    message: t.message,
    suggestion: t.suggestion,
    status: t.status,
    note: t.note,
    count: t.count,
    lastRun: t.lastRun.id
});
