import { describe, expect, it } from 'vitest';
import { parseOrgList } from './available';
import { loginArgs, loginUrl } from './login';

describe('parseOrgList', () => {
    it('führt Gruppen zusammen, entfernt Doppelte und sortiert nach Alias', () => {
        const sandbox = {
            alias: 'cdev5',
            username: 'a@x.cdev5',
            orgId: '00D1',
            instanceUrl: 'u',
            isSandbox: true,
            connectedStatus: 'Connected'
        };
        const orgs = parseOrgList({
            nonScratchOrgs: [
                { alias: 'us-prod', username: 'p@x', orgId: '00D2', instanceUrl: 'u' },
                sandbox
            ],
            sandboxes: [sandbox],
            devHubs: []
        });
        expect(orgs.map((o) => o.alias)).toEqual(['cdev5', 'us-prod']);
        expect(orgs[0]).toMatchObject({ isSandbox: true, status: 'Connected' });
        expect(orgs[1]).toMatchObject({ isSandbox: false, status: 'Unbekannt' });
    });
});

describe('login', () => {
    it('baut die Argumente je Art', () => {
        expect(loginArgs({ alias: 'x', kind: 'production' })).toEqual([
            'org',
            'login',
            'web',
            '--alias',
            'x'
        ]);
        expect(loginArgs({ alias: 'x', kind: 'sandbox' })).toContain('https://test.salesforce.com');
    });

    it('erlaubt eigene URLs nur unter salesforce.com und force.com', () => {
        expect(loginUrl({ kind: 'custom', instanceUrl: 'https://jk.my.salesforce.com/foo' })).toBe(
            'https://jk.my.salesforce.com'
        );
        expect(() => loginUrl({ kind: 'custom', instanceUrl: 'https://evil.com' })).toThrow();
        expect(() =>
            loginUrl({ kind: 'custom', instanceUrl: 'http://x.salesforce.com' })
        ).toThrow();
        expect(() =>
            loginUrl({ kind: 'custom', instanceUrl: 'https://salesforce.com.evil.com' })
        ).toThrow();
    });
});
