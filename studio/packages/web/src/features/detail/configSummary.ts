import type { DescribeResponse, FieldInfo, QueryModel } from '@studio/shared';
import { isOrGroup } from '@studio/shared';
import { uncoveredTargetFields } from '../fields/coverage';
import { countStatuses, fieldStatus } from '../fields/fieldStatus';

export interface MappingSummary {
    auto: number; // 1:1
    manual: number; // gemappt
    missing: number; // fehlen im Ziel
    deviations: number; // Typ, nicht schreibbar, fehlt in Quelle
    excluded: number;
    requiredOpen: number; // Pflichtfelder im Ziel ohne Quelle
}

// Status des Mappings aus Feldliste und Describe. null, solange das Ziel nicht lesbar ist.
export function mappingSummary(
    fields: FieldInfo[],
    describe: DescribeResponse | undefined
): MappingSummary | null {
    if (!describe?.target.ok) return null;
    const rows = fields.map((f) => ({ f, s: fieldStatus(f, describe) }));
    const c = countStatuses(rows);
    return {
        auto: c.ok,
        manual: c.mapped,
        missing: c.missing,
        deviations: c.type + c.readonly + c.srcmissing,
        excluded: c.excluded,
        requiredOpen: uncoveredTargetFields(fields, describe.target.fields).filter(
            (u) => u.field.required
        ).length
    };
}

export const mappingReady = (m: MappingSummary) => m.missing === 0 && m.requiredOpen === 0;

// Anzahl der Filterbedingungen der Query (eine ODER-Gruppe zählt als eine, Text-WHERE als eine).
export function filterCount(model: QueryModel): number {
    if (model.filters) return model.filters.filter((n) => isOrGroup(n) || 'field' in n).length;
    return model.rawWhere ? 1 : 0;
}

export function parentsText(model: QueryModel): string {
    const n = model.parents.length;
    if (!n) return '';
    const pull = model.parents.filter((p) => p.mode === 'pull').length;
    const read = model.parents.filter((p) => p.mode === 'read').length;
    const custom = n - pull - read;
    const parts = [
        read && `${read} nur lesen`,
        pull && `${pull} mitziehen`,
        custom && `${custom} manuell`
    ].filter(Boolean);
    return `${n} ${n === 1 ? 'Parent' : 'Parents'}: ${parts.join(', ')}`;
}
