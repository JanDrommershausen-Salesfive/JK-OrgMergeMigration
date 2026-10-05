import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DescribedField } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import type { QueryRunner } from '../query/check';
import type { ExportConfig } from '../sfdmu/exportConfig';
import { findPathToRoot } from './path';
import { resolveCohortIds, shuffle } from './resolve';
import { applyCohort } from './scope';
import { CohortStore, cohortId } from './store';

const ids = ['001A', '001B'];
const cohort = { rootObject: 'Account', ids };

describe('applyCohort', () => {
    it('Root-Objekt: die Kohorte kommt zum Filter des Zielobjekts hinzu', () => {
        const cfg: ExportConfig = {
            objects: [
                {
                    query: 'SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7',
                    operation: 'Upsert',
                    externalId: 'Name'
                }
            ]
        };
        const r = applyCohort(cfg, cohort, {}, { keepFilters: true });
        expect(r.scoped).toBe(true);
        expect(r.config.objects[0]?.query).toBe(
            "SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7 AND Id IN ('001A', '001B')"
        );
        expect(cfg.objects[0]?.query).toContain('LAST_N_DAYS'); // Original bleibt unverändert
        // Standard: die Kohorte ersetzt eigene Filter
        expect(applyCohort(cfg, cohort, {}).config.objects[0]?.query).toBe(
            "SELECT Id, Name FROM Account WHERE Id IN ('001A', '001B')"
        );
    });

    it('Kind mit Account-Parent: Parent wird zum Root mit der Kohorte, das Ziel zum Slave', () => {
        const cfg: ExportConfig = {
            objects: [
                {
                    query: 'SELECT Id, Name FROM Account',
                    operation: 'Readonly',
                    externalId: 'Name',
                    master: false
                },
                {
                    query: 'SELECT Id, Email, AccountId FROM Contact',
                    operation: 'Upsert',
                    externalId: 'Email'
                }
            ]
        };
        const r = applyCohort(cfg, cohort, { Contact: ['Account'] });
        expect(r.scoped).toBe(true);
        expect(r.config.objects[0]).toEqual({
            query: "SELECT Id, Name FROM Account WHERE Id IN ('001A', '001B')",
            operation: 'Readonly',
            externalId: 'Name'
        });
        expect(r.config.objects[1]?.master).toBe(false);
        expect(cfg.objects[0]?.master).toBe(false); // Original bleibt unverändert
    });

    it('Kette: auch Zwischen-Parents werden zu Slaves, Stammdaten bleiben unberührt', () => {
        const cfg: ExportConfig = {
            objects: [
                {
                    query: 'SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7',
                    operation: 'Readonly',
                    externalId: 'Name'
                },
                {
                    query: 'SELECT Id, Name FROM Pricebook2',
                    operation: 'Readonly',
                    externalId: 'Name'
                },
                {
                    query: 'SELECT Id, Name FROM Opportunity',
                    operation: 'Readonly',
                    externalId: 'Name'
                },
                { query: 'SELECT Id, OpportunityId FROM OpportunityLineItem', operation: 'Insert' }
            ]
        };
        const links = {
            Opportunity: ['Account', 'Pricebook2'],
            OpportunityLineItem: ['Opportunity']
        };
        const r = applyCohort(cfg, cohort, links);
        expect(r.scoped).toBe(true);
        expect(r.config.objects.map((o) => o.master)).toEqual([undefined, undefined, false, false]);
        expect(r.config.objects[0]?.query).toBe(
            "SELECT Id, Name FROM Account WHERE Id IN ('001A', '001B')"
        );
    });

    it('Kind: eigene Filter fallen weg und lassen sich bewusst behalten', () => {
        const cfg: ExportConfig = {
            objects: [
                {
                    query: 'SELECT Id, Name FROM Account',
                    operation: 'Readonly',
                    externalId: 'Name'
                },
                {
                    query: 'SELECT Id, AccountId FROM Contact WHERE CreatedDate = LAST_N_DAYS:7',
                    operation: 'Upsert',
                    externalId: 'Email'
                }
            ]
        };
        const links = { Contact: ['Account'] };
        expect(applyCohort(cfg, cohort, links).config.objects[1]?.query).toBe(
            'SELECT Id, AccountId FROM Contact'
        );
        expect(
            applyCohort(cfg, cohort, links, { keepFilters: true }).config.objects[1]?.query
        ).toContain('LAST_N_DAYS');
    });

    it('Kind: eigene Filter fallen weg und lassen sich bewusst behalten', () => {
        const cfg: ExportConfig = {
            objects: [
                {
                    query: 'SELECT Id, Name FROM Account',
                    operation: 'Readonly',
                    externalId: 'Name'
                },
                {
                    query: 'SELECT Id, AccountId FROM Contact WHERE CreatedDate = LAST_N_DAYS:7',
                    operation: 'Upsert',
                    externalId: 'Email'
                }
            ]
        };
        const links = { Contact: ['Account'] };
        expect(applyCohort(cfg, cohort, links).config.objects[1]?.query).toBe(
            'SELECT Id, AccountId FROM Contact'
        );
        expect(
            applyCohort(cfg, cohort, links, { keepFilters: true }).config.objects[1]?.query
        ).toContain('LAST_N_DAYS');
    });

    it('ohne Account-Bezug läuft das Objekt unverändert und meldet es', () => {
        const noRoot: ExportConfig = {
            objects: [{ query: 'SELECT Id FROM Task', operation: 'Insert' }]
        };
        const r1 = applyCohort(noRoot, cohort, {});
        expect(r1).toMatchObject({ scoped: false, config: noRoot });
        expect(r1.notes[0]).toMatch(/Kein Account-Eintrag/);

        const noLink: ExportConfig = {
            objects: [
                { query: 'SELECT Id FROM Account', operation: 'Readonly', externalId: 'Name' },
                { query: 'SELECT Id FROM Thing__c', operation: 'Insert' }
            ]
        };
        const r2 = applyCohort(noLink, cohort, { Thing__c: [] });
        expect(r2.scoped).toBe(false);
        expect(r2.notes[0]).toMatch(/keinen Lookup/);
    });
});

const ref = (rel: string, to: string): DescribedField => ({
    type: `reference(${to})`,
    baseType: 'reference',
    label: rel,
    createable: true,
    updateable: true,
    relationshipName: rel,
    referenceTo: [to]
});

describe('findPathToRoot', () => {
    const describes: Record<string, Record<string, DescribedField>> = {
        Contact: { AccountId: ref('Account', 'Account'), OwnerId: ref('Owner', 'User') },
        OrderItem: { OrderId: ref('Order', 'Order'), Product2Id: ref('Product2', 'Product2') },
        Order: { AccountId: ref('Account', 'Account') },
        Product2: {},
        Orphan__c: {},
        OpportunityLineItem: {
            CreatedById: ref('CreatedBy', 'User'),
            OpportunityId: ref('Opportunity', 'Opportunity')
        },
        Opportunity: { AccountId: ref('Account', 'Account') },
        User: { AccountId: ref('Account', 'Account') }
    };
    const lookups = async (o: string) => describes[o] ?? null;

    it('findet direkte und zweistufige Wege', async () => {
        expect((await findPathToRoot('Contact', 'Account', lookups))?.path).toBe('AccountId');
        expect((await findPathToRoot('OrderItem', 'Account', lookups))?.path).toBe(
            'Order.AccountId'
        );
    });

    it('geht nicht über Benutzer (Anleger), sondern über den fachlichen Parent', async () => {
        expect((await findPathToRoot('OpportunityLineItem', 'Account', lookups))?.path).toBe(
            'Opportunity.AccountId'
        );
    });

    it('liefert null ohne Weg', async () => {
        expect(await findPathToRoot('Orphan__c', 'Account', lookups)).toBeNull();
        expect(await findPathToRoot('Product2', 'Account', lookups)).toBeNull();
    });
});

describe('resolveCohortIds', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
        Id: `001${String(i).padStart(12, '0')}`
    }));
    const run: QueryRunner = async (_a, soql) =>
        soql.includes('IN (')
            ? { records: rows.slice(0, 2), totalSize: 2 }
            : { records: rows, totalSize: rows.length };

    it('zieht eine reproduzierbare Stichprobe', async () => {
        const rule = { kind: 'sample' as const, size: 5, filters: [] };
        const a = await resolveCohortIds({
            rootObject: 'Account',
            rule,
            sourceAlias: 's',
            run,
            seed: 42
        });
        const b = await resolveCohortIds({
            rootObject: 'Account',
            rule,
            sourceAlias: 's',
            run,
            seed: 42
        });
        expect(a).toHaveLength(5);
        expect(a).toEqual(b);
        expect(new Set(a).size).toBe(5);
    });

    it('prüft eine feste Liste gegen die Quelle', async () => {
        const known = [rows[0]!.Id, rows[1]!.Id];
        expect(
            await resolveCohortIds({
                rootObject: 'Account',
                rule: { kind: 'ids', ids: known },
                sourceAlias: 's',
                run
            })
        ).toEqual(known);
        await expect(
            resolveCohortIds({
                rootObject: 'Account',
                rule: { kind: 'ids', ids: [...known, '001999999999999'] },
                sourceAlias: 's',
                run
            })
        ).rejects.toThrow(/gibt es in der Quelle nicht/);
    });

    it('mischt deterministisch', () => {
        expect(shuffle([1, 2, 3, 4, 5, 6], 7)).toEqual(shuffle([1, 2, 3, 4, 5, 6], 7));
    });
});

describe('CohortStore', () => {
    it('speichert, listet und löscht Kohorten', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'coh-'));
        const store = new CohortStore(dir);
        const id = cohortId('Test Müller 50');
        expect(id).toMatch(/^test-muller-50-\d{12}$/);
        await store.save({
            id,
            name: 'Test',
            createdAt: '2026-10-02T10:00:00Z',
            rootObject: 'Account',
            rule: { kind: 'ids', ids: ['001000000000001'] },
            ids: ['001000000000001'],
            count: 1
        });
        expect((await store.list()).map((c) => c.id)).toEqual([id]);
        expect((await store.get(id)).count).toBe(1);
        await store.delete(id);
        expect(await store.list()).toEqual([]);
        await expect(store.get('..')).rejects.toThrow(/Unbekannte/);
    });
});
