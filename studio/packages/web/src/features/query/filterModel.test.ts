import type { DescribedField, Filter } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import {
    allFilters,
    choiceOf,
    defaultValue,
    inputKind,
    listToText,
    normaliseNodes,
    operatorChoices,
    rowProblem,
    textToList
} from './filterModel';

const f = (baseType: string): DescribedField => ({
    type: baseType,
    baseType,
    label: 'x',
    createable: true,
    updateable: true
});

describe('filterModel', () => {
    it('leitet die Eingabeart aus dem Feldtyp ab', () => {
        expect(inputKind(f('boolean'))).toBe('boolean');
        expect(inputKind(f('datetime'))).toBe('date');
        expect(inputKind(f('currency'))).toBe('number');
        expect(inputKind(f('picklist'))).toBe('text');
        expect(inputKind(undefined)).toBe('text');
    });

    it('bietet je Art passende Operatoren und "ist leer"', () => {
        expect(operatorChoices('boolean').map((o) => o.op)).toEqual(['=', '!=']);
        expect(operatorChoices('text').some((o) => o.op === 'LIKE')).toBe(true);
        expect(operatorChoices('number').some((o) => o.id === 'empty')).toBe(true);
    });

    it('erkennt "ist leer" und "ist nicht leer" an null-Werten', () => {
        const filter: Filter = { field: 'Fax', op: '!=', value: { kind: 'null' } };
        expect(choiceOf(filter, 'text').id).toBe('notempty');
        expect(choiceOf({ ...filter, value: { kind: 'string', value: 'x' } }, 'text').id).toBe(
            '!='
        );
    });

    it('wandelt Werte-Listen zwischen Text und Modell um', () => {
        expect(textToList('DE, AT ,')).toEqual({
            kind: 'list',
            values: [
                { kind: 'string', value: 'DE' },
                { kind: 'string', value: 'AT' }
            ]
        });
        expect(listToText(textToList('DE, AT'))).toBe('DE, AT');
    });

    it('meldet unvollständige Zeilen', () => {
        const base: Filter = { field: 'Name', op: 'LIKE', value: { kind: 'string', value: '' } };
        expect(rowProblem(base)).toMatch(/Wert fehlt/);
        expect(rowProblem({ ...base, op: '=' })).toBeNull();
        expect(rowProblem({ ...base, value: { kind: 'number', value: 'abc' } })).toMatch(/Zahl/);
        expect(
            rowProblem({ field: 'D', op: '=', value: { kind: 'literal', value: 'LAST_N_DAYS' } })
        ).toMatch(/Anzahl/);
        expect(rowProblem({ field: 'D', op: '=', value: defaultValue('date') })).toBeNull();
    });
});

describe('Filterbaum', () => {
    const a: Filter = { field: 'A', op: '=', value: { kind: 'null' } };
    const b: Filter = { field: 'B', op: '=', value: { kind: 'null' } };

    it('sammelt Einzelbedingungen aus Gruppen', () => {
        expect(allFilters([a, { or: [a, b] }]).map((f) => f.field)).toEqual(['A', 'A', 'B']);
    });

    it('macht aus Gruppen mit einer Bedingung eine einfache und lässt echte Gruppen stehen', () => {
        expect(normaliseNodes([{ or: [a] } as never, { or: [a, b] }, { or: [] } as never])).toEqual(
            [a, { or: [a, b] }]
        );
    });
});
