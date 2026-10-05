import { describe, expect, it } from 'vitest';
import { prepareQuickSoql, runQuickQuery } from './quick';

describe('prepareQuickSoql', () => {
    it('lässt SELECT zu und ergänzt ein LIMIT', () => {
        expect(prepareQuickSoql('SELECT BillingState\n FROM Account')).toBe(
            'SELECT BillingState FROM Account LIMIT 5000'
        );
        expect(prepareQuickSoql('select Id from Account limit 10')).toBe(
            'select Id from Account limit 10'
        );
    });

    it('lehnt alles außer einer einzelnen SELECT-Abfrage ab', () => {
        for (const bad of [
            'DELETE FROM Account',
            'SELECT Id FROM Account; SELECT Id FROM Contact',
            'SELECT Id FROM Account -- x',
            'SELECT Id',
            'UPDATE Account SET Name = 1'
        ])
            expect(() => prepareQuickSoql(bad)).toThrow();
    });
});

describe('runQuickQuery', () => {
    it('flacht Relationen ab und meldet gekürzte Ergebnisse', async () => {
        const run = async () => ({
            totalSize: 3,
            records: [
                { attributes: {}, BillingState: 'CA', Owner: { attributes: {}, Name: 'Jan' } },
                { attributes: {}, BillingState: null, Owner: { Name: 'Eva' } }
            ]
        });
        expect(
            await runQuickQuery('us-prod', 'SELECT BillingState, Owner.Name FROM Account', run)
        ).toEqual({
            alias: 'us-prod',
            soql: 'SELECT BillingState, Owner.Name FROM Account LIMIT 5000',
            columns: ['BillingState', 'Owner.Name'],
            rows: [
                ['CA', 'Jan'],
                ['', 'Eva']
            ],
            totalSize: 3,
            truncated: true
        });
    });
});
