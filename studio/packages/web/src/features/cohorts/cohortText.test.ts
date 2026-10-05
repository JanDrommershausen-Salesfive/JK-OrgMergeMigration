import { describe, expect, it } from 'vitest';
import { estimateMb, nodeText, parseIds } from './cohortText';

describe('cohortText', () => {
    it('trennt Ids an Leerzeichen, Kommas, Semikolons und Zeilenumbrüchen und entfernt Doppelte', () => {
        expect(parseIds('001A, 001B;001A\n001C  \n')).toEqual(['001A', '001B', '001C']);
        expect(parseIds('  ')).toEqual([]);
    });

    it('schätzt den Speicherbedarf', () => {
        expect(estimateMb(10)).toBe('<0,1 MB');
        expect(estimateMb(1024)).toBe('2 MB');
    });

    it('beschreibt Filterbedingungen lesbar', () => {
        const state = {
            field: 'BillingState',
            op: '=' as const,
            value: { kind: 'string' as const, value: 'CA' }
        };
        const type = {
            field: 'Type',
            op: 'IN' as const,
            value: {
                kind: 'list' as const,
                values: [
                    { kind: 'string' as const, value: 'A' },
                    { kind: 'string' as const, value: 'B' }
                ]
            }
        };
        expect(nodeText(state)).toBe('BillingState = „CA“');
        expect(nodeText({ or: [state, type] })).toBe('BillingState = „CA“ ODER Type IN („A“, „B“)');
        expect(nodeText({ field: 'Fax', op: '=', value: { kind: 'null' } })).toBe('Fax = leer');
    });
});
