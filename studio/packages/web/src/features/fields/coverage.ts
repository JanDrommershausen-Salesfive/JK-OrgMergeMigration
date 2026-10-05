import type { DescribedField, FieldInfo } from '@studio/shared';

export interface UncoveredField {
    name: string;
    field: DescribedField;
}

// Zielfelder, die der Lauf nicht befüllt: schreibbar im Ziel, aber kein (nicht ausgeschlossenes)
// Quellfeld wird darauf gemappt. Pflichtfelder stehen zuerst, danach alphabetisch.
export function uncoveredTargetFields(
    fields: FieldInfo[],
    target: Record<string, DescribedField>
): UncoveredField[] {
    const covered = new Set(
        fields.filter((f) => !f.excluded).map((f) => f.targetField.toLowerCase())
    );
    return Object.entries(target)
        .filter(([name, f]) => f.createable && !covered.has(name.toLowerCase()))
        .map(([name, field]) => ({ name, field }))
        .sort(
            (a, b) =>
                Number(!!b.field.required) - Number(!!a.field.required) ||
                a.name.localeCompare(b.name)
        );
}
