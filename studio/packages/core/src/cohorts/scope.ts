import type { Filter } from '@studio/shared';
import { formatValue } from '../query/soql';
import { buildSoql, parseSoql } from '../query/soql';
import { objectOf, type ExportConfig, type ExportObject } from '../sfdmu/exportConfig';

export interface ScopeResult {
    config: ExportConfig;
    scoped: boolean; // das Zielobjekt folgt der Kohorte
    notes: string[];
}

const idFilter = (ids: string[]): Filter => ({
    field: 'Id',
    op: 'IN',
    value: { kind: 'list', values: ids.map((value) => ({ kind: 'string' as const, value })) }
});

// Setzt den WHERE-Teil eines Eintrags auf die Kohorte (Id IN …); bestehende Filter bleiben beim Zielobjekt,
// beim Parent-Eintrag ersetzt die Kohorte den bisherigen Umfang.
function withIds(entry: ExportObject, ids: string[], keepExisting: boolean): ExportObject {
    const p = parseSoql(entry.query);
    const existing = keepExisting ? p.filters : [];
    if (keepExisting && p.filters === null) {
        const raw = `(${p.rawWhere ?? ''}) AND Id IN ${formatValue(idFilter(ids).value)}`;
        return { ...entry, query: buildSoql({ ...p, filters: null, rawWhere: raw }) };
    }
    return {
        ...entry,
        query: buildSoql({ ...p, filters: [...(existing ?? []), idFilter(ids)], rawWhere: null })
    };
}

const refsOf = (links: Record<string, string[]>, object: string) => links[object] ?? [];

// Die Kohorte bestimmt den Umfang: eigene Filter der Einträge (zum Beispiel ein Zeitfilter zum Verkleinern der
// Testmenge) fallen weg, außer keepFilters ist gesetzt.
function stripFilters(entry: ExportObject): ExportObject {
    const p = parseSoql(entry.query);
    if (!p.supported) return entry;
    return { ...entry, query: buildSoql({ ...p, filters: [], rawWhere: null }) };
}

// Erzeugt die Konfiguration für einen Lauf auf eine Kohorte, ohne die gespeicherte export.json zu ändern.
// Der Root-Eintrag bekommt die Kohorte, alle davon abhängigen Einträge laufen als master:false: SFDMU holt dann nur
// Datensätze, die zu den bereits gewählten Parents gehören. links: Objekt → Objekte, auf die es per Lookup zeigt.
export function applyCohort(
    config: ExportConfig,
    cohort: { rootObject: string; ids: string[] },
    links: Record<string, string[]>,
    options: { keepFilters?: boolean } = {}
): ScopeResult {
    const objects = config.objects.map((o) => ({ ...o }));
    const last = objects.length - 1;
    const target = objects[last] as ExportObject;
    const root = cohort.rootObject;

    if (objectOf(target) === root) {
        objects[last] = withIds(
            options.keepFilters ? target : stripFilters(target),
            cohort.ids,
            true
        );
        return { config: { ...config, objects }, scoped: true, notes: [] };
    }
    const rootIdx = objects.findIndex((o, i) => i < last && objectOf(o) === root);
    if (rootIdx === -1) {
        return {
            config,
            scoped: false,
            notes: [
                `Kein ${root}-Eintrag in der Konfiguration: läuft ohne Einschränkung auf die Kohorte.`
            ]
        };
    }

    const rootEntry = withIds(objects[rootIdx] as ExportObject, cohort.ids, false);
    delete rootEntry.master;
    objects[rootIdx] = rootEntry;

    const reachable = new Set([root]);
    for (let i = rootIdx + 1; i <= last; i++) {
        const entry = objects[i] as ExportObject;
        if (refsOf(links, objectOf(entry)).some((r) => reachable.has(r))) {
            entry.master = false;
            if (!options.keepFilters) objects[i] = stripFilters(entry);
            reachable.add(objectOf(entry));
        }
    }
    const scoped = reachable.has(objectOf(target));
    return {
        config: { ...config, objects },
        scoped,
        notes: scoped
            ? []
            : [
                  `${objectOf(target)} hat keinen Lookup auf ${root} oder dessen abhängige Parents: läuft ohne Einschränkung.`
              ]
    };
}

// Für Tests und Anzeige: Id-Liste als SOQL-Text.
export const idList = (ids: string[]): string => formatValue(idFilter(ids).value);
