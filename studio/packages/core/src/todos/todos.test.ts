import type { RunMeta, TodoItem } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { classifyError, normalizeMessage } from './classify';
import { draftsFromRun, mergeTodos } from './merge';

const STATE =
    "There's a problem with this state, even though it may appear correct. Please select a state from the list of valid states.: Billing State/Province";

describe('classifyError', () => {
    it('erkennt ungültigen State und bildet den API-Namen', () => {
        const c = classifyError(STATE);
        expect(c).toMatchObject({
            category: 'state-invalid',
            field: 'Billing State/Province',
            apiField: 'BillingState',
            step: 'werte'
        });
    });

    it('erkennt fehlendes Land', () => {
        const c = classifyError(
            'A country/territory must be specified before specifying a state value for field: Shipping State/Province'
        );
        expect(c).toMatchObject({ category: 'state-needs-country', apiField: 'ShippingState' });
    });

    it('erkennt Pflichtfeld, Picklist und Validierung', () => {
        expect(
            classifyError('REQUIRED_FIELD_MISSING:Required fields are missing: [LastName]:--')
        ).toMatchObject({ category: 'required', field: 'LastName', apiField: 'LastName' });
        expect(
            classifyError(
                'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST:bad value for restricted picklist field: Industry:Industry:--'
            )
        ).toMatchObject({ category: 'picklist' });
        expect(
            classifyError('FIELD_CUSTOM_VALIDATION_EXCEPTION:Bitte ein Land angeben:--').category
        ).toBe('validation');
    });

    it('stuft Unbekanntes als nicht klassifiziert ein', () => {
        expect(classifyError('Something odd with 001AB0000012345AAA').category).toBe('other');
    });
});

describe('normalizeMessage', () => {
    it('entfernt Ids, Zahlen und Werte', () => {
        expect(normalizeMessage("Duplicate on 001AB0000012345AAA value 'Acme' row 12")).toBe(
            'Duplicate on <Id> value „…“ row #'
        );
    });
});

const meta = (id: string): RunMeta =>
    ({
        id,
        folder: '010_Account',
        object: 'Account',
        endedAt: `2026-10-05T10:0${id}:00Z`
    }) as RunMeta;
const err = (label: string, error = STATE) => ({
    file: 'insert',
    id: '#N/A',
    oldId: `001${label}`,
    label,
    error
});

describe('draftsFromRun und mergeTodos', () => {
    it('fasst gleiche Fehler zusammen und trennt Billing von Shipping', () => {
        const drafts = draftsFromRun(
            meta('1'),
            [err('A'), err('B'), err('C'), err('D', STATE.replace('Billing', 'Shipping'))],
            []
        );
        expect(drafts.map((d) => d.count).sort()).toEqual([1, 3]);
        expect(drafts.find((d) => d.count === 3)!.examples).toHaveLength(3);
    });

    it('legt neu an, aktualisiert und öffnet Erledigtes wieder', () => {
        const first = mergeTodos(
            [],
            draftsFromRun(meta('1'), [err('A'), err('B')], []),
            meta('1'),
            'n1'
        );
        expect(first.result).toEqual({ added: 1, updated: 0, reopened: 0 });
        const done: TodoItem[] = first.items.map((t) => ({ ...t, status: 'done', note: 'gelöst' }));
        const second = mergeTodos(done, draftsFromRun(meta('2'), [err('A')], []), meta('2'), 'n2');
        expect(second.result).toEqual({ added: 0, updated: 1, reopened: 1 });
        expect(second.items[0]).toMatchObject({ status: 'open', note: 'gelöst', count: 1 });
        expect(second.items[0]!.firstRun.id).toBe('1');
        expect(second.items[0]!.lastRun.id).toBe('2');
    });

    it('übernimmt fehlende Parents', () => {
        const drafts = draftsFromRun(
            meta('1'),
            [],
            [
                {
                    lookupField: 'ParentId',
                    parentObject: 'Account',
                    value: 'X',
                    recordId: 'r1',
                    object: 'Account'
                },
                {
                    lookupField: 'ParentId',
                    parentObject: 'Account',
                    value: 'Y',
                    recordId: 'r2',
                    object: 'Account'
                }
            ]
        );
        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ category: 'parent-missing', count: 2 });
    });
});
