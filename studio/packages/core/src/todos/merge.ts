import { createHash } from 'node:crypto';
import type {
    ErrorRow,
    ImportTodosResponse,
    MissingParentRow,
    RunMeta,
    TodoItem
} from '@studio/shared';
import { classifyError } from './classify';

const MAX_EXAMPLES = 3;

export const fingerprint = (...parts: (string | null)[]) =>
    createHash('sha1')
        .update(parts.map((p) => p ?? '').join('|'))
        .digest('hex')
        .slice(0, 12);

type Draft = Omit<TodoItem, 'status' | 'note' | 'firstRun' | 'lastRun' | 'createdAt' | 'updatedAt'>;

// Fasst die Fehler und fehlenden Parents eines Laufs zu Einträgen zusammen: gleiche Fehler ergeben einen Eintrag.
export function draftsFromRun(
    meta: RunMeta,
    errors: ErrorRow[],
    missing: MissingParentRow[]
): Draft[] {
    const drafts = new Map<string, Draft>();
    const add = (
        id: string,
        base: Omit<Draft, 'id' | 'count' | 'examples'>,
        example: { label: string; id: string }
    ) => {
        const d = drafts.get(id) ?? { ...base, id, count: 0, examples: [] };
        d.count++;
        if (d.examples.length < MAX_EXAMPLES) d.examples.push(example);
        drafts.set(id, d);
    };

    for (const e of errors) {
        const c = classifyError(e.error);
        const id = fingerprint(
            meta.object,
            c.category,
            c.field ?? c.message,
            c.field ? '' : c.message
        );
        add(
            id,
            { object: meta.object, folder: meta.folder, ...c },
            { label: e.label, id: e.oldId || e.id }
        );
    }
    for (const m of missing) {
        const field = m.lookupField;
        const id = fingerprint(m.object || meta.object, 'parent-missing', field, m.parentObject);
        add(
            id,
            {
                object: m.object || meta.object,
                folder: meta.folder,
                category: 'parent-missing',
                field,
                apiField: field,
                message: `${field} verweist auf ${m.parentObject}, der im Ziel fehlt`,
                suggestion: `${m.parentObject} zuerst migrieren (Reihenfolge) oder Parent-Modus „mitziehen“ in der Query von ${meta.object} wählen.`,
                step: 'query'
            },
            { label: m.value, id: m.recordId }
        );
    }
    return [...drafts.values()];
}

// Führt die Einträge eines Laufs mit der bestehenden Liste zusammen. Erledigte Einträge, die wieder auftauchen, werden geöffnet.
export function mergeTodos(
    existing: TodoItem[],
    drafts: Draft[],
    meta: RunMeta,
    now: string
): { items: TodoItem[]; result: ImportTodosResponse } {
    const ref = { folder: meta.folder, id: meta.id, at: meta.endedAt };
    const byId = new Map(existing.map((t) => [t.id, t]));
    const result: ImportTodosResponse = { added: 0, updated: 0, reopened: 0 };
    for (const d of drafts) {
        const old = byId.get(d.id);
        if (!old) {
            byId.set(d.id, {
                ...d,
                status: 'open',
                note: '',
                firstRun: ref,
                lastRun: ref,
                createdAt: now,
                updatedAt: now
            });
            result.added++;
            continue;
        }
        const reopen = old.status === 'done';
        byId.set(d.id, {
            ...old,
            ...d,
            status: reopen ? 'open' : old.status,
            note: old.note,
            firstRun: old.firstRun,
            lastRun: ref,
            createdAt: old.createdAt,
            updatedAt: now
        });
        result.updated++;
        if (reopen) result.reopened++;
    }
    return { items: [...byId.values()], result };
}
