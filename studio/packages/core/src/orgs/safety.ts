export interface OrgInfo {
    alias: string;
    orgId: string;
    isSandbox: boolean;
}

export interface SafetyInput {
    source: OrgInfo;
    target: OrgInfo;
    protectedOrgIds: string[];
}

export type SafetyResult = { ok: true } | { ok: false; reason: string };

// Org-IDs sind 15 oder 18 Zeichen lang; die ersten 15 sind eindeutig.
const same = (a: string, b: string) => a.slice(0, 15) === b.slice(0, 15);

// Schreibende Funktionen (Live-Lauf, Sandbox leeren) laufen nur, wenn diese Prüfung ok ist.
export function checkTargetAllowed({ source, target, protectedOrgIds }: SafetyInput): SafetyResult {
    if (same(source.orgId, target.orgId)) {
        return { ok: false, reason: 'Quelle und Ziel sind dieselbe Org.' };
    }
    if (protectedOrgIds.some((id) => same(id, target.orgId))) {
        return { ok: false, reason: `Ziel ${target.alias} ist als geschützte Org markiert.` };
    }
    if (!target.isSandbox) {
        return { ok: false, reason: `Ziel ${target.alias} ist keine Sandbox.` };
    }
    return { ok: true };
}

// Der Alias muss beim Lauf noch dieselbe Org auflösen wie beim Pinnen.
export function checkPinnedOrg(pinnedOrgId: string, resolvedOrgId: string): SafetyResult {
    return same(pinnedOrgId, resolvedOrgId)
        ? { ok: true }
        : {
              ok: false,
              reason: `Alias zeigt auf ${resolvedOrgId}, gepinnt war ${pinnedOrgId}.`
          };
}
