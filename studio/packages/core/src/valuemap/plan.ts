import type { DescribedField, ValueMappingRow, ValueMappingSync } from '@studio/shared';
import type { PicklistMappingRow } from './mappingFile';

// SFDMU übergeht leere Zielwerte (der Quellwert bleibt). Erst #N/A setzt das Feld im Ziel auf leer.
export const CLEAR_VALUE = '#N/A';

const PICKLIST = new Set(['picklist', 'multipicklist']);

// Excel nennt Standardfelder beim API-Namen, Custom-Felder beim Label. Ein Label zählt nur, wenn es eindeutig ist.
export function resolveField(name: string, source: Record<string, DescribedField>): string | null {
    const lower = name.toLowerCase();
    const byName = Object.keys(source).find((n) => n.toLowerCase() === lower);
    if (byName) return byName;
    const byLabel = Object.keys(source).filter((n) => source[n]?.label.toLowerCase() === lower);
    return byLabel.length === 1 ? (byLabel[0] as string) : null;
}

interface PlanInput {
    object: string;
    fields: string[]; // Felder der Query, die übernommen werden dürfen
    source: Record<string, DescribedField>;
    existing: ValueMappingRow[];
    rows: PicklistMappingRow[];
}

// Neue Zeilen je Feld: nur Picklist-Felder, nur Quellwerte, die die CSV noch nicht kennt.
export function planValueMappings({ object, fields, source, existing, rows }: PlanInput) {
    const wanted = new Set(fields.filter((f) => PICKLIST.has(source[f]?.baseType ?? '')));
    const known = new Map(existing.map((r) => [`${r.field}\u0000${r.from}`, r.to]));
    const added: ValueMappingRow[] = [];
    const conflicts: ValueMappingSync['conflicts'] = [];
    const resolved = new Map<string, string | null>();

    for (const r of rows) {
        if (r.sourceObject !== object) continue;
        if (!resolved.has(r.sourceField))
            resolved.set(r.sourceField, resolveField(r.sourceField, source));
        const field = resolved.get(r.sourceField);
        if (!field || !wanted.has(field)) continue;
        const to = r.targetValue || CLEAR_VALUE;
        const key = `${field}\u0000${r.sourceValue}`;
        const csv = known.get(key);
        if (csv === undefined) {
            added.push({ field, from: r.sourceValue, to });
            known.set(key, to); // doppelte Excel-Zeilen: die erste gilt
        } else if (
            csv !== to &&
            !added.some((a) => a.field === field && a.from === r.sourceValue)
        ) {
            conflicts.push({ field, from: r.sourceValue, csv, file: to });
        }
    }
    return { added, conflicts };
}
