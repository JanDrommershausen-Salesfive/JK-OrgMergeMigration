import type { DescribeResponse, DescribedField, FieldInfo, QueryModel } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { filterCount, mappingReady, mappingSummary, parentsText } from './configSummary';

const d = (over: Partial<DescribedField> = {}): DescribedField => ({
    type: 'string(80)',
    baseType: 'string',
    label: 'x',
    createable: true,
    updateable: true,
    ...over
});
const f = (name: string, targetField = name, over: Partial<FieldInfo> = {}): FieldInfo => ({
    name,
    lookup: false,
    parent: null,
    parentReadonly: false,
    owner: false,
    externalId: false,
    valueMapped: false,
    excluded: false,
    targetField,
    renamed: name !== targetField,
    ...over
});
const describeWith = (
    src: Record<string, DescribedField>,
    tgt: Record<string, DescribedField>
): DescribeResponse => ({ source: { ok: true, fields: src }, target: { ok: true, fields: tgt } });

describe('mappingSummary', () => {
    it('zählt automatische, manuelle, fehlende und ausgeschlossene Felder sowie offene Pflichtfelder', () => {
        const describe_ = describeWith(
            { Name: d(), Phone: d(), Fax: d(), Industry: d(), Skip: d() },
            {
                Name: d(),
                Phone: d({ type: 'phone', baseType: 'phone' }),
                Branche__c: d(),
                Skip: d(),
                Rating: d({ required: true })
            }
        );
        const m = mappingSummary(
            [
                f('Name'),
                f('Phone'),
                f('Fax'),
                f('Industry', 'Branche__c'),
                f('Skip', 'Skip', { excluded: true })
            ],
            describe_
        )!;
        expect(m).toEqual({
            auto: 1,
            manual: 1,
            missing: 1,
            deviations: 1,
            excluded: 1,
            requiredOpen: 1
        });
        expect(mappingReady(m)).toBe(false);
    });

    it('ist bereit, wenn nichts fehlt und keine Pflichtfelder offen sind', () => {
        const m = mappingSummary(
            [f('Name')],
            describeWith({ Name: d() }, { Name: d(), Optional__c: d() })
        )!;
        expect(mappingReady(m)).toBe(true);
    });

    it('liefert null, solange das Ziel nicht lesbar ist', () => {
        expect(mappingSummary([f('Name')], undefined)).toBeNull();
        expect(
            mappingSummary([f('Name')], {
                source: { ok: true, fields: {} },
                target: { ok: false, error: 'x' }
            })
        ).toBeNull();
    });
});

const model = (over: Partial<QueryModel> = {}): QueryModel => ({
    folder: 'x',
    object: 'Account',
    soql: '',
    fields: [],
    filters: [],
    rawWhere: null,
    tail: '',
    supported: true,
    parents: [],
    ...over
});
const parent = (mode: 'read' | 'pull' | 'custom') => ({
    index: 0,
    object: 'A',
    operation: 'Readonly',
    master: false,
    externalId: 'Name',
    where: null,
    fields: [],
    mode,
    configFolder: null
});

describe('filterCount und parentsText', () => {
    it('zählt Bedingungen und ODER-Gruppen, Text-WHERE als eine', () => {
        const cond = { field: 'A', op: '=' as const, value: { kind: 'null' as const } };
        expect(filterCount(model())).toBe(0);
        expect(filterCount(model({ filters: [cond, { or: [cond, cond] }] }))).toBe(2);
        expect(filterCount(model({ filters: null, rawWhere: 'A = 1 OR B = 2' }))).toBe(1);
    });

    it('fasst Parents mit Modus zusammen', () => {
        expect(parentsText(model())).toBe('');
        expect(parentsText(model({ parents: [parent('read')] }))).toBe('1 Parent: 1 nur lesen');
        expect(
            parentsText(model({ parents: [parent('read'), parent('pull'), parent('custom')] }))
        ).toBe('3 Parents: 1 nur lesen, 1 mitziehen, 1 manuell');
    });
});
