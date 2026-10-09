import type { QueryModel } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { checkQuery, type QueryRunner } from './check';

const model: QueryModel = {
    folder: '020_Contact',
    object: 'Contact',
    soql: '',
    fields: ['Id', 'Email', 'AccountId'],
    filters: [
        { field: 'CreatedDate', op: '=', value: { kind: 'literal', value: 'LAST_N_DAYS:7' } }
    ],
    rawWhere: null,
    tail: '',
    supported: true,
    parents: [
        {
            index: 0,
            object: 'Account',
            operation: 'Readonly',
            master: false,
            externalId: 'Name',
            where: null,
            fields: ['Id', 'Name'],
            mode: 'read',
            configFolder: '010_Account'
        }
    ]
};
const describeOk = {
    ok: true as const,
    fields: {
        Id: { type: 'id', baseType: 'id', label: 'Id', createable: false, updateable: false },
        Email: { type: 'email', baseType: 'email', label: 'E', createable: true, updateable: true },
        AccountId: {
            type: 'reference(Account)',
            baseType: 'reference',
            label: 'A',
            createable: true,
            updateable: true,
            relationshipName: 'Account'
        }
    }
};

describe('checkQuery', () => {
    it('zählt, zeigt Beispiele und ermittelt fehlende Parents im Ziel', async () => {
        const calls: string[] = [];
        const run: QueryRunner = async (alias, soql) => {
            calls.push(`${alias}: ${soql}`);
            if (soql.startsWith('SELECT COUNT()')) return { records: [], totalSize: 46 };
            if (soql.includes('GROUP BY')) {
                return {
                    records: [
                        { attributes: {}, Name: 'A' },
                        { attributes: {}, Name: 'B' },
                        { attributes: {}, Name: 'C' }
                    ],
                    totalSize: 3
                };
            }
            if (alias === 'tgt') return { records: [{ Name: 'a' }, { Name: 'C' }], totalSize: 2 };
            return { records: [{ Id: '003', Email: 'x@y.de', AccountId: '001' }], totalSize: 1 };
        };
        const r = await checkQuery({
            model,
            sourceAlias: 'src',
            targetAlias: 'tgt',
            sourceDescribe: describeOk,
            run
        });

        expect(r.count).toBe(46);
        expect(r.columns).toEqual(['Id', 'Email', 'AccountId']);
        expect(r.rows).toEqual([['003', 'x@y.de', '001']]);
        expect(r.parents[0]).toMatchObject({
            lookupField: 'AccountId',
            referenced: 3,
            existingInTarget: 2,
            missing: 1
        });
        expect(calls.find((c) => c.includes('GROUP BY'))).toContain(
            '(CreatedDate = LAST_N_DAYS:7) AND AccountId != null'
        );
        expect(calls.find((c) => c.startsWith('tgt'))).toContain("Name IN ('A', 'B', 'C')");
    });

    it('fragt in den Beispielzeilen nur Felder ab, die in der Quelle existieren', async () => {
        const withGhost = { ...model, fields: ['Id', 'AssistantName', 'Email', 'AccountId'] };
        const queries: string[] = [];
        const run: QueryRunner = async (_alias, soql) => {
            queries.push(soql);
            return { records: [], totalSize: 0 };
        };
        const describeWithFields = {
            ok: true as const,
            fields: {
                Id: {
                    type: 'id',
                    baseType: 'id',
                    label: 'Id',
                    createable: false,
                    updateable: false
                },
                Email: {
                    type: 'email',
                    baseType: 'email',
                    label: 'E',
                    createable: true,
                    updateable: true
                },
                AccountId: describeOk.fields.AccountId
            }
        };
        const r = await checkQuery({
            model: withGhost,
            sourceAlias: 's',
            targetAlias: 't',
            sourceDescribe: describeWithFields,
            run
        });
        expect(r.columns).toEqual(['Id', 'Email', 'AccountId']);
        expect(queries.find((q) => q.includes('LIMIT 5'))).not.toContain('AssistantName');
    });

    it('meldet Fehler der Hauptabfrage, ohne die Parents zu prüfen', async () => {
        const run: QueryRunner = async () => {
            throw new Error('INVALID_FIELD');
        };
        const r = await checkQuery({
            model,
            sourceAlias: 's',
            targetAlias: 't',
            sourceDescribe: describeOk,
            run
        });
        expect(r.error).toBe('INVALID_FIELD');
        expect(r.parents).toEqual([]);
    });

    it('überspringt Parents mit mehrteiliger External ID', async () => {
        const multi = {
            ...model,
            parents: [{ ...model.parents[0]!, externalId: 'Name;AccountId' }]
        };
        const run: QueryRunner = async () => ({ records: [], totalSize: 0 });
        const r = await checkQuery({
            model: multi,
            sourceAlias: 's',
            targetAlias: 't',
            sourceDescribe: describeOk,
            run
        });
        expect(r.parents[0]?.note).toMatch(/Mehrteilige/);
    });

    it('liest alle Felder der Query, nicht nur die ersten acht', async () => {
        const fields = Array.from({ length: 12 }, (_, i) => `Feld${i}__c`);
        const wide: QueryModel = { ...model, fields, parents: [] };
        const describe = {
            ok: true as const,
            fields: Object.fromEntries(
                fields.map((f) => [
                    f,
                    {
                        type: 'string',
                        baseType: 'string',
                        label: f,
                        createable: true,
                        updateable: true
                    }
                ])
            )
        };
        const run: QueryRunner = async (_alias, soql) =>
            soql.startsWith('SELECT COUNT()')
                ? { records: [], totalSize: 1 }
                : { records: [Object.fromEntries(fields.map((f) => [f, 'x']))], totalSize: 1 };
        const r = await checkQuery({
            model: wide,
            sourceAlias: 'src',
            targetAlias: 'tgt',
            sourceDescribe: describe,
            run
        });
        expect(r.columns).toEqual(fields);
        expect(r.rows[0]).toHaveLength(12);
    });
});
