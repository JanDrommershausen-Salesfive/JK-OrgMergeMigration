import { isOrGroup, type Filter, type FilterNode } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { buildSoql, parseSoql, validateRawWhere } from './soql';

// Nur einfache Bedingungen (ohne ODER-Gruppen) für die bestehenden Tests.
const simple = (nodes: FilterNode[] | null): Filter[] =>
    (nodes ?? []).filter((n): n is Filter => !isOrGroup(n));

describe('parseSoql', () => {
    it('liest Felder, Objekt und einen Zeitfilter', () => {
        const q = parseSoql('SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7');
        expect(q).toMatchObject({
            fields: ['Id', 'Name'],
            object: 'Account',
            supported: true,
            rawWhere: null,
            filters: [
                {
                    field: 'CreatedDate',
                    op: '=',
                    value: { kind: 'literal', value: 'LAST_N_DAYS:7' }
                }
            ]
        });
    });

    it('liest mehrere Bedingungen mit allen Werttypen', () => {
        const q = parseSoql(
            "SELECT Id FROM Contact WHERE Name LIKE 'A%' AND IsActive__c = true AND Amount >= 10.5 AND Birthdate < 2000-01-01 AND Country IN ('DE', 'AT') AND Fax = null"
        );
        expect(simple(q.filters).map((f) => [f.field, f.op, f.value.kind])).toEqual([
            ['Name', 'LIKE', 'string'],
            ['IsActive__c', '=', 'boolean'],
            ['Amount', '>=', 'number'],
            ['Birthdate', '<', 'date'],
            ['Country', 'IN', 'list'],
            ['Fax', '=', 'null']
        ]);
    });

    it('beachtet AND in Anführungszeichen und IN-Listen', () => {
        const q = parseSoql(
            "SELECT Id FROM Account WHERE Name = 'Bar AND Grill' AND Type IN ('A, B', 'C')"
        );
        expect(q.filters).toHaveLength(2);
        expect(simple(q.filters)[0]?.value).toEqual({ kind: 'string', value: 'Bar AND Grill' });
    });

    it('behält ORDER BY und LIMIT als Rest', () => {
        const q = parseSoql("SELECT Id FROM Account WHERE Name = 'x' ORDER BY Name LIMIT 10");
        expect(q.tail).toBe('ORDER BY Name LIMIT 10');
        expect(q.filters).toHaveLength(1);
    });

    it('geht bei OR, Klammern und Unterabfragen in den Rohmodus', () => {
        for (const where of [
            "Name = 'a' OR Name = 'b'",
            "(Name = 'a' OR Name = 'b' AND Type = 'x')",
            "((Name = 'a' OR Name = 'b') AND Type = 'x') OR Id = '1'",
            'Id IN (SELECT AccountId FROM Contact)'
        ]) {
            const q = parseSoql(`SELECT Id FROM Account WHERE ${where}`);
            expect(q.filters).toBeNull();
            expect(q.rawWhere).toBe(where);
            expect(q.supported).toBe(true);
        }
    });

    it('erkennt Query ohne WHERE und nicht darstellbare SELECT-Teile', () => {
        expect(parseSoql('SELECT Id, Name FROM Pricebook2').filters).toEqual([]);
        expect(parseSoql('SELECT Id, (SELECT Id FROM Contacts) FROM Account').supported).toBe(
            false
        );
        expect(parseSoql('SELECT COUNT(Id) FROM Account').supported).toBe(false);
        expect(parseSoql('kein soql').supported).toBe(false);
    });
});

describe('ODER-Gruppen', () => {
    it('liest eine ODER-Gruppe in Klammern neben einfachen Bedingungen', () => {
        const q = parseSoql(
            "SELECT Id FROM Account WHERE Country = 'DE' AND (Type = 'A' OR Type = 'B')"
        );
        expect(q.filters).toEqual([
            { field: 'Country', op: '=', value: { kind: 'string', value: 'DE' } },
            {
                or: [
                    { field: 'Type', op: '=', value: { kind: 'string', value: 'A' } },
                    { field: 'Type', op: '=', value: { kind: 'string', value: 'B' } }
                ]
            }
        ]);
    });

    it('löst eine UND-Liste in Klammern in einfache Bedingungen auf', () => {
        const q = parseSoql('SELECT Id FROM Account WHERE (A = 1 AND B = 2) AND C = 3');
        expect(simple(q.filters).map((f) => f.field)).toEqual(['A', 'B', 'C']);
    });

    it('schreibt ODER-Gruppen mit Klammern, damit SOQL sie akzeptiert', () => {
        const where = "Country = 'DE' AND (Type = 'A' OR Type = 'B')";
        const q = parseSoql(`SELECT Id FROM Account WHERE ${where}`);
        expect(buildSoql({ ...q })).toBe(`SELECT Id FROM Account WHERE ${where}`);
    });

    it('übernimmt eine ODER-Gruppe mit IN-Liste und Datum', () => {
        const q = parseSoql(
            "SELECT Id FROM Account WHERE (Type IN ('A', 'B') OR CreatedDate = LAST_N_DAYS:7)"
        );
        expect(q.filters).toHaveLength(1);
        expect(isOrGroup((q.filters ?? [])[0] as FilterNode)).toBe(true);
    });
});

describe('buildSoql', () => {
    const roundTrip = (q: string) => {
        const p = parseSoql(q);
        return buildSoql({ ...p, object: p.object });
    };

    it('gibt eine unveränderte Query gleichlautend zurück', () => {
        for (const q of [
            'SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7',
            "SELECT Id FROM Contact WHERE Name LIKE 'A%' AND Country IN ('DE', 'AT') ORDER BY Name LIMIT 5",
            'SELECT Id, Name FROM Pricebook2'
        ]) {
            expect(roundTrip(q)).toBe(q);
        }
    });

    it('maskiert Anführungszeichen und Backslashes in Texten', () => {
        const q = buildSoql({
            fields: ['Id'],
            object: 'Account',
            filters: [{ field: 'Name', op: '=', value: { kind: 'string', value: "O'Brien\\x" } }],
            rawWhere: null,
            tail: ''
        });
        expect(q).toBe("SELECT Id FROM Account WHERE Name = 'O\\'Brien\\\\x'");
        expect(simple(parseSoql(q).filters)[0]?.value).toEqual({
            kind: 'string',
            value: "O'Brien\\x"
        });
    });

    it('nutzt im Rohmodus den Text', () => {
        expect(
            buildSoql({
                fields: ['Id'],
                object: 'Account',
                filters: null,
                rawWhere: 'A = 1 OR B = 2',
                tail: ''
            })
        ).toBe('SELECT Id FROM Account WHERE A = 1 OR B = 2');
    });
});

describe('validateRawWhere', () => {
    it('lässt normale Bedingungen zu', () => {
        expect(validateRawWhere("Name = 'a' OR (Type = 'b' AND X = 1)")).toBeNull();
        expect(validateRawWhere('Id IN (SELECT AccountId FROM Contact)')).toBeNull();
    });

    it('lehnt Semikolons, Zeilenumbrüche und offene Klammern oder Texte ab', () => {
        expect(validateRawWhere('A = 1; DROP')).not.toBeNull();
        expect(validateRawWhere('A = 1\nB = 2')).not.toBeNull();
        expect(validateRawWhere("Name = 'offen")).not.toBeNull();
        expect(validateRawWhere('(A = 1')).not.toBeNull();
        expect(validateRawWhere('A = 1)')).not.toBeNull();
    });
});
