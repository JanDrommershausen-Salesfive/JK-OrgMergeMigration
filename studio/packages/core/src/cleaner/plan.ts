import type { CleanPlan, CleanPlanRequest, CleanStep, CleanerRules } from '@studio/shared';
import { and, scopeWhere } from './scope';

export interface ChildRelation {
    childSObject: string;
    field: string;
    restrictedDelete: boolean;
    cascadeDelete: boolean;
}

// Lesender Zugriff auf die Ziel-Org (austauschbar für Tests).
export interface PlanDeps {
    count: (soql: string) => Promise<number>;
    children: (object: string) => Promise<ChildRelation[]>;
    activatedOrderStatuses: () => Promise<string[]>;
}

// Objekte, die nicht einfach per Id-Liste löschbar sind.
function specialCase(object: string, scope: string) {
    switch (object) {
        case 'ContentVersion':
            // Versionen lassen sich nicht direkt löschen; das Dokument nimmt alle Versionen mit.
            return {
                object: 'ContentDocument',
                where: scope,
                prepare: null,
                note: 'über ContentDocument (löscht alle Versionen)'
            };
        case 'Pricebook2':
            return {
                object,
                where: and(scope, 'IsStandard = false'),
                prepare: null,
                note: 'das Standard-Preisbuch bleibt (nicht löschbar)'
            };
        case 'Order':
            return { object, where: scope, prepare: 'deactivate-orders' as const, note: null };
        default:
            return { object, where: scope, prepare: null, note: null };
    }
}

// Wie viele Abfragen gleichzeitig laufen (jede ist ein sf-Aufruf).
const CONCURRENCY = 5;

async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i] as T);
            }
        })
    );
    return out;
}

const countSoql = (object: string, where: string) =>
    `SELECT COUNT() FROM ${object}${where ? ` WHERE ${where}` : ''}`;
const inParent = (field: string, parent: string, parentWhere: string) =>
    `${field} IN (SELECT Id FROM ${parent}${parentWhere ? ` WHERE ${parentWhere}` : ''})`;

// Baut die Reihenfolge, in der gelöscht wird: Kinder vor Eltern. Grundlage ist die Migrationsreihenfolge rückwärts,
// dazu kommen Objekte, die das Löschen verhindern (restrictedDelete, zum Beispiel Cases und Orders am Account).
export async function buildPlan(opts: {
    request: CleanPlanRequest;
    migrationObjects: string[]; // in Migrationsreihenfolge, Eltern zuerst
    alias: string;
    username: string;
    userId: string;
    deps: PlanDeps;
    rules?: CleanerRules;
    now?: Date;
}): Promise<CleanPlan> {
    const { request, alias, username, userId, deps } = opts;
    const rules: CleanerRules = opts.rules ?? { exclude: [], blockers: [] };
    const scope = scopeWhere(request.scope, userId);
    const wanted = new Set(request.objects);
    const excluded = new Set(rules.exclude);
    const chosen = [...opts.migrationObjects]
        .filter((o) => wanted.has(o) && !excluded.has(o))
        .reverse();
    const planned = new Set(chosen);
    const steps: Omit<CleanStep, 'order'>[] = [];
    const warnings: string[] = [];

    // Pro Objekt unabhängig prüfen (mehrere gleichzeitig, jede Abfrage dauert Sekunden), danach in Reihenfolge zusammensetzen.
    const analyses = await mapLimit(chosen, CONCURRENCY, async (object) => {
        const special = specialCase(object, scope);
        const blockers: Omit<CleanStep, 'order'>[] = [];
        const notes: string[] = [];

        if (request.includeBlockers) {
            let relations: ChildRelation[] = [];
            try {
                relations = (await deps.children(special.object)).filter((r) => r.restrictedDelete);
            } catch {
                notes.push(`Blocker für ${object} konnten nicht ermittelt werden.`);
            }
            // Von Salesforce gemeldete Blocker plus die Regeln dieses Projekts (Regel gewinnt bei "anyCreator").
            const candidates = new Map<
                string,
                { child: string; field: string; anyCreator: boolean; note?: string }
            >();
            for (const rel of relations) {
                candidates.set(`${rel.childSObject}.${rel.field}`, {
                    child: rel.childSObject,
                    field: rel.field,
                    anyCreator: false
                });
            }
            for (const rule of rules.blockers.filter(
                (r) => r.blocks === object || r.blocks === special.object
            )) {
                candidates.set(`${rule.object}.${rule.field}`, {
                    child: rule.object,
                    field: rule.field,
                    anyCreator: rule.anyCreator,
                    note: rule.note
                });
            }
            const found = await mapLimit([...candidates.values()], CONCURRENCY, async (rel) => {
                const child = rel.child;
                if (planned.has(child) || excluded.has(child)) return null;
                const link = inParent(rel.field, special.object, special.where);
                const anyCreator = request.blockersAnyCreator || rel.anyCreator;
                const where = and(link, anyCreator ? '' : scope);
                try {
                    const count = await deps.count(countSoql(child, where));
                    let warning: string | null = null;
                    if (request.scope.creator === 'me' && !anyCreator) {
                        const any = await deps.count(countSoql(child, link));
                        if (any > count) {
                            warning = `${any - count} ${child}-Datensätze anderer Ersteller hängen an ${object}-Datensätzen im Umfang und verhindern deren Löschen.`;
                        }
                    }
                    return { child, count, where, warning, note: rel.note };
                } catch {
                    return null; // Objekt nicht abfragbar (nicht verfügbar oder keine Rechte): kann das Löschen nicht blockieren
                }
            });
            for (const f of found) {
                if (!f) continue;
                if (f.warning) notes.push(f.warning);
                if (f.count > 0) {
                    blockers.push({
                        object: f.child,
                        label: f.child,
                        reason: 'blocker',
                        blocks: object,
                        where: f.where,
                        count: f.count,
                        prepare: null,
                        note: f.note
                            ? `verhindert das Löschen von ${object} (${f.note})`
                            : `verhindert das Löschen von ${object}`
                    });
                }
            }
        }

        let count: number | null = null;
        let note = special.note;
        try {
            count = await deps.count(countSoql(special.object, special.where));
            if (special.prepare === 'deactivate-orders' && count > 0) {
                const statuses = await deps.activatedOrderStatuses();
                if (statuses.length) {
                    const quoted = statuses.map((s) => `'${s.replace(/'/g, "\\'")}'`).join(', ');
                    const active = await deps.count(
                        countSoql('Order', and(special.where, `Status IN (${quoted})`))
                    );
                    if (active > 0)
                        note = `${active} aktivierte Orders werden zuerst auf Draft gesetzt`;
                }
            }
        } catch (err) {
            note = `Zählen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
        }
        const step: Omit<CleanStep, 'order'> = {
            object: special.object,
            label: object,
            reason: 'migration',
            blocks: null,
            where: special.where,
            count,
            prepare: special.prepare,
            note
        };
        return { step, blockers, notes };
    });

    // Blocker stehen direkt vor dem Objekt, das sie blockieren; jeder Blocker nur einmal.
    for (const a of analyses) {
        for (const b of a.blockers) {
            if (planned.has(b.object)) continue;
            planned.add(b.object);
            steps.push(b);
        }
        warnings.push(...a.notes);
        steps.push(a.step);
    }

    return {
        alias,
        username,
        createdAt: (opts.now ?? new Date()).toISOString(),
        scope: request.scope,
        steps: steps.map((s, i) => ({ ...s, order: i + 1 })),
        warnings,
        total: steps.reduce((sum, s) => sum + (s.count ?? 0), 0)
    };
}
