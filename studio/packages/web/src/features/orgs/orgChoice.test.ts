import type { AvailableOrg } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { disabledReason } from './orgChoice';

const org = (over: Partial<AvailableOrg>): AvailableOrg => ({
    alias: 'x',
    username: 'u',
    orgId: '00D',
    instanceUrl: '',
    isSandbox: false,
    isScratch: false,
    status: 'Connected',
    ...over
});

describe('disabledReason', () => {
    it('sperrt Produktivorgs als Ziel, nicht als Quelle', () => {
        expect(disabledReason(org({}), 'target')).toMatch(/gesperrt/);
        expect(disabledReason(org({}), 'source')).toBeNull();
    });

    it('erlaubt Sandboxes als Ziel', () => {
        expect(disabledReason(org({ isSandbox: true }), 'target')).toBeNull();
    });

    it('sperrt Orgs ohne Alias', () => {
        expect(disabledReason(org({ alias: null }), 'source')).toMatch(/Alias/);
    });
});
