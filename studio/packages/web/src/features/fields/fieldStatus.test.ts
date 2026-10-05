import type { DescribeResponse, DescribedField, FieldInfo } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { fieldStatus } from './fieldStatus';

const field = (over: Partial<FieldInfo> = {}): FieldInfo => ({
    name: 'Phone',
    lookup: false,
    parent: null,
    parentReadonly: false,
    owner: false,
    externalId: false,
    valueMapped: false,
    excluded: false,
    targetField: 'Phone',
    renamed: false,
    ...over
});
const df = (over: Partial<DescribedField> = {}): DescribedField => ({
    type: 'phone',
    baseType: 'phone',
    label: 'x',
    createable: true,
    updateable: true,
    ...over
});
const describeWith = (
    src: Record<string, DescribedField>,
    tgt: Record<string, DescribedField>
): DescribeResponse => ({
    source: { ok: true, fields: src },
    target: { ok: true, fields: tgt }
});

describe('fieldStatus', () => {
    it('ist ausgeschlossen vor allem anderen', () => {
        expect(fieldStatus(field({ excluded: true }), undefined).key).toBe('excluded');
    });

    it('wartet auf Describe-Daten', () => {
        expect(fieldStatus(field(), undefined).key).toBe('pending');
    });

    it('erkennt ein 1:1-Feld', () => {
        const d = describeWith({ Phone: df() }, { Phone: df() });
        expect(fieldStatus(field(), d).key).toBe('ok');
    });

    it('erkennt ein fehlendes Zielfeld', () => {
        expect(fieldStatus(field(), describeWith({ Phone: df() }, {})).key).toBe('missing');
    });

    it('erkennt abweichenden Typ oder Länge', () => {
        const d = describeWith(
            { Phone: df({ type: 'string(40)' }) },
            { Phone: df({ type: 'string(20)' }) }
        );
        expect(fieldStatus(field(), d).key).toBe('type');
    });

    it('erkennt ein nicht schreibbares Zielfeld', () => {
        const d = describeWith({ Phone: df() }, { Phone: df({ createable: false }) });
        expect(fieldStatus(field(), d).key).toBe('readonly');
    });

    it('behandelt polymorphe Referenzen als gleich', () => {
        const a = df({ type: 'reference(2 Objekte)' });
        const b = df({ type: 'reference(3 Objekte)' });
        const f = field({ name: 'OwnerId', targetField: 'OwnerId' });
        expect(fieldStatus(f, describeWith({ OwnerId: a }, { OwnerId: b })).key).toBe('ok');
    });

    it('zeigt ein Mapping, wenn Quelle und Ziel verschieden heißen', () => {
        const d = describeWith({ Phone: df() }, { Mobile__c: df() });
        expect(fieldStatus(field({ targetField: 'Mobile__c', renamed: true }), d).key).toBe(
            'mapped'
        );
    });
});
