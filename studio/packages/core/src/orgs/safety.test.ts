import { describe, expect, it } from 'vitest';
import { checkPinnedOrg, checkTargetAllowed, type OrgInfo } from './safety';

const source: OrgInfo = { alias: 'us-prod', orgId: '00DDn000006CppDMAS', isSandbox: false };
const sandbox: OrgInfo = { alias: 'CDEV5', orgId: '00D9K00000KSJIxUAP', isSandbox: true };

describe('checkTargetAllowed', () => {
    it('erlaubt eine Sandbox als Ziel', () => {
        expect(checkTargetAllowed({ source, target: sandbox, protectedOrgIds: [] }).ok).toBe(true);
    });

    it('blockiert eine Produktivorg als Ziel', () => {
        const target = { ...sandbox, isSandbox: false };
        expect(checkTargetAllowed({ source, target, protectedOrgIds: [] }).ok).toBe(false);
    });

    it('blockiert eine geschützte Org auch bei 15-stelliger ID', () => {
        const result = checkTargetAllowed({
            source,
            target: sandbox,
            protectedOrgIds: ['00D9K00000KSJIx']
        });
        expect(result.ok).toBe(false);
    });

    it('blockiert Quelle gleich Ziel', () => {
        expect(checkTargetAllowed({ source, target: source, protectedOrgIds: [] }).ok).toBe(false);
    });
});

describe('checkPinnedOrg', () => {
    it('akzeptiert dieselbe Org-ID', () => {
        expect(checkPinnedOrg('00D9K00000KSJIxUAP', '00D9K00000KSJIx').ok).toBe(true);
    });

    it('lehnt eine andere Org-ID ab', () => {
        expect(checkPinnedOrg('00D9K00000KSJIxUAP', '00DDn000006CppD').ok).toBe(false);
    });
});
