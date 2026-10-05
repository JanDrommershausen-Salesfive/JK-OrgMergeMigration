import type { DescribedField, FieldInfo } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { uncoveredTargetFields } from './coverage';

const t = (over: Partial<DescribedField> = {}): DescribedField => ({
    type: 'string(80)',
    baseType: 'string',
    label: 'x',
    createable: true,
    updateable: true,
    ...over
});
const f = (name: string, targetField = name, excluded = false): FieldInfo => ({
    name,
    lookup: false,
    parent: null,
    parentReadonly: false,
    owner: false,
    externalId: false,
    valueMapped: false,
    excluded,
    targetField,
    renamed: name !== targetField
});

describe('uncoveredTargetFields', () => {
    const target = {
        Name: t({ required: true }),
        Phone: t(),
        Branche__c: t(),
        Rating: t({ required: true }),
        Id: t({ createable: false })
    };

    it('findet Zielfelder ohne Quelle, Pflichtfelder zuerst', () => {
        const result = uncoveredTargetFields([f('Name'), f('Industry', 'Branche__c')], target);
        expect(result.map((r) => r.name)).toEqual(['Rating', 'Phone']);
    });

    it('zählt ausgeschlossene Felder nicht als Quelle', () => {
        const result = uncoveredTargetFields([f('Name', 'Name', true)], target);
        expect(result.map((r) => r.name)).toEqual(['Name', 'Rating', 'Branche__c', 'Phone']);
    });

    it('ignoriert nicht schreibbare Zielfelder und beachtet Groß-/Kleinschreibung nicht', () => {
        const result = uncoveredTargetFields([f('phone', 'PHONE')], {
            Phone: t(),
            Id: t({ createable: false })
        });
        expect(result).toEqual([]);
    });
});
