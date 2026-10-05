import type { CleanPlanRequest } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { CleanerRulesSchema } from '@studio/shared';
import { buildPlan, type ChildRelation, type PlanDeps } from './plan';
import { scopeWhere } from './scope';

const USER = '0059K00000XlwK5QAJ';
const request = (over: Partial<CleanPlanRequest> = {}): CleanPlanRequest => ({
    objects: ['Account', 'Contact', 'Case', 'Order', 'OrderItem', 'ContentVersion', 'Pricebook2'],
    scope: { creator: 'me', since: null },
    includeBlockers: true,
    blockersAnyCreator: false,
    ...over
});
const migration = [
    'Account',
    'Contact',
    'Pricebook2',
    'Case',
    'Order',
    'OrderItem',
    'ContentVersion'
];

function deps(
    counts: Record<string, number>,
    relations: Record<string, ChildRelation[]> = {}
): PlanDeps & { asked: string[] } {
    const asked: string[] = [];
    return {
        asked,
        count: async (soql) => {
            asked.push(soql);
            const key = Object.keys(counts).find(
                (k) =>
                    soql.startsWith(`SELECT COUNT() FROM ${k}`) &&
                    (soql.includes(k.split('|')[1] ?? '') || !k.includes('|'))
            );
            return key ? (counts[key] as number) : 0;
        },
        children: async (o) => relations[o] ?? [],
        activatedOrderStatuses: async () => ['Activated']
    };
}
const rel = (childSObject: string, field: string): ChildRelation => ({
    childSObject,
    field,
    restrictedDelete: true,
    cascadeDelete: false
});

describe('scopeWhere', () => {
    it('begrenzt auf den Ersteller und optional ab Datum', () => {
        expect(scopeWhere({ creator: 'me' }, USER)).toBe(`CreatedById = '${USER}'`);
        expect(scopeWhere({ creator: 'me', since: '2026-10-01' }, USER)).toBe(
            `CreatedById = '${USER}' AND CreatedDate >= 2026-10-01T00:00:00Z`
        );
        expect(scopeWhere({ creator: 'any' }, USER)).toBe('');
        expect(() => scopeWhere({ creator: 'me' }, "x' OR 'a'='a")).toThrow(/Benutzer-Id/);
    });
});

describe('buildPlan', () => {
    it('löscht in umgekehrter Migrationsreihenfolge, Kinder vor Eltern', async () => {
        const plan = await buildPlan({
            request: request(),
            migrationObjects: migration,
            alias: 'CDEV5',
            username: 'u',
            userId: USER,
            deps: deps({})
        });
        expect(plan.steps.map((s) => s.label)).toEqual([
            'ContentVersion',
            'OrderItem',
            'Order',
            'Case',
            'Pricebook2',
            'Contact',
            'Account'
        ]);
    });

    it('nimmt nur die gewählten Objekte', async () => {
        const plan = await buildPlan({
            request: request({ objects: ['Contact', 'Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: deps({})
        });
        expect(plan.steps.map((s) => s.label)).toEqual(['Contact', 'Account']);
    });

    it('behandelt Sonderfälle: Dokument statt Version, Standard-Preisbuch bleibt, Orders werden deaktiviert', async () => {
        const plan = await buildPlan({
            request: request(),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: deps({ Order: 3 })
        });
        const step = (label: string) => plan.steps.find((s) => s.label === label)!;
        expect(step('ContentVersion')).toMatchObject({ object: 'ContentDocument' });
        expect(step('Pricebook2').where).toContain('IsStandard = false');
        expect(step('Order')).toMatchObject({ prepare: 'deactivate-orders' });
    });

    it('findet Blocker am Account, die nicht zur Migration gehören, und setzt sie vor den Account', async () => {
        const d = deps(
            { Contract: 4 },
            { Account: [rel('Contract', 'AccountId'), rel('Case', 'AccountId')] }
        );
        const plan = await buildPlan({
            request: request({ objects: ['Contact', 'Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d
        });
        const labels = plan.steps.map((s) => `${s.reason}:${s.label}`);
        expect(labels).toEqual(['migration:Contact', 'blocker:Contract', 'migration:Account']);
        const blocker = plan.steps[1]!;
        expect(blocker).toMatchObject({ blocks: 'Account', count: 4 });
        expect(blocker.where).toContain(
            `AccountId IN (SELECT Id FROM Account WHERE CreatedById = '${USER}')`
        );
        expect(blocker.where).toContain(`CreatedById = '${USER}'`);
    });

    it('lässt Blocker weg, die schon im Plan stehen oder keine Treffer haben', async () => {
        const d = deps({}, { Account: [rel('Case', 'AccountId'), rel('Contract', 'AccountId')] });
        const plan = await buildPlan({
            request: request({ objects: ['Case', 'Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d
        });
        expect(plan.steps.map((s) => s.label)).toEqual(['Case', 'Account']);
    });

    it('warnt vor Blockern anderer Ersteller und kann sie auf Wunsch mitnehmen', async () => {
        const counts = (soqlHasCreator: boolean) => async (soql: string) =>
            soql.startsWith('SELECT COUNT() FROM Contract')
                ? soql.includes('CreatedById = ') &&
                  soqlHasCreator &&
                  soql.includes(
                      "WHERE AccountId IN (SELECT Id FROM Account WHERE CreatedById = '" +
                          USER +
                          "') AND CreatedById"
                  )
                    ? 1
                    : 5
                : 0;
        const base = {
            children: async () => [rel('Contract', 'AccountId')],
            activatedOrderStatuses: async () => []
        };
        const strict = await buildPlan({
            request: request({ objects: ['Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: { ...base, count: counts(true) }
        });
        expect(strict.warnings[0]).toMatch(/anderer Ersteller/);
        const any = await buildPlan({
            request: request({ objects: ['Account'], blockersAnyCreator: true }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: { ...base, count: counts(false) }
        });
        expect(any.warnings).toEqual([]);
        expect(any.steps[0]).toMatchObject({ reason: 'blocker', count: 5 });
        expect(any.steps[0]!.where).not.toMatch(/AND CreatedById/);
    });

    it('summiert die Datensätze und überspringt die Blockersuche auf Wunsch', async () => {
        const d = deps({ Account: 10, Contact: 20 }, { Account: [rel('Contract', 'AccountId')] });
        const plan = await buildPlan({
            request: request({ objects: ['Contact', 'Account'], includeBlockers: false }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d
        });
        expect(plan.total).toBe(30);
        expect(plan.steps.some((s) => s.reason === 'blocker')).toBe(false);
    });
});

describe('Projektregeln', () => {
    const rules = (r: unknown) => CleanerRulesSchema.parse(r);
    const entitlementRule = {
        blockers: [
            {
                object: 'Entitlement',
                field: 'AccountId',
                blocks: 'Account',
                anyCreator: true,
                note: 'automatisch angelegt'
            }
        ]
    };

    it('nimmt einen Blocker aus der Regel auch dann auf, wenn Salesforce ihn nicht meldet', async () => {
        const d = deps({ Entitlement: 7 }); // children() liefert nichts
        const plan = await buildPlan({
            request: request({ objects: ['Contact', 'Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d,
            rules: rules(entitlementRule)
        });
        expect(plan.steps.map((s) => s.label)).toEqual(['Contact', 'Entitlement', 'Account']);
        expect(plan.steps[1]).toMatchObject({ reason: 'blocker', blocks: 'Account', count: 7 });
        expect(plan.steps[1]!.note).toContain('automatisch angelegt');
    });

    it('anyCreator: der Blocker wird unabhängig vom Ersteller gesucht', async () => {
        const d = deps({ Entitlement: 3 });
        const plan = await buildPlan({
            request: request({ objects: ['Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d,
            rules: rules(entitlementRule)
        });
        expect(plan.steps[0]!.where).toBe(
            `AccountId IN (SELECT Id FROM Account WHERE CreatedById = '${USER}')`
        );
        expect(plan.warnings).toEqual([]);
    });

    it('ein von Salesforce gemeldeter Blocker und die Regel werden nur einmal aufgenommen', async () => {
        const d = deps({ Entitlement: 2 }, { Account: [rel('Entitlement', 'AccountId')] });
        const plan = await buildPlan({
            request: request({ objects: ['Account'] }),
            migrationObjects: migration,
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d,
            rules: rules(entitlementRule)
        });
        expect(plan.steps.filter((s) => s.label === 'Entitlement')).toHaveLength(1);
    });

    it('exclude nimmt Objekte aus dem Plan, auch als Blocker', async () => {
        const d = deps({ Contract: 4 }, { Account: [rel('Contract', 'AccountId')] });
        const plan = await buildPlan({
            request: request({ objects: ['Product2', 'Account'] }),
            migrationObjects: [...migration, 'Product2'],
            alias: 'a',
            username: 'u',
            userId: USER,
            deps: d,
            rules: rules({ exclude: ['Product2', 'Contract'] })
        });
        expect(plan.steps.map((s) => s.label)).toEqual(['Account']);
    });
});
