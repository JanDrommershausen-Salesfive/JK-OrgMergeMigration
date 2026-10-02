import type { AvailableOrg } from '@studio/shared';

export const orgLabel = (o: AvailableOrg) => o.alias ?? o.username;
export const orgType = (o: AvailableOrg) =>
    o.isScratch ? 'Scratch' : o.isSandbox ? 'Sandbox' : 'Production';
export const isConnected = (o: AvailableOrg) => o.status === 'Connected';

// Warum eine Org für die jeweilige Rolle nicht wählbar ist (null: wählbar).
export function disabledReason(org: AvailableOrg, role: 'source' | 'target'): string | null {
    if (!org.alias) return 'Ohne Alias nicht wählbar (Alias beim Anmelden vergeben)';
    if (role === 'target' && !org.isSandbox) return 'Produktivorgs sind als Ziel gesperrt';
    return null;
}
