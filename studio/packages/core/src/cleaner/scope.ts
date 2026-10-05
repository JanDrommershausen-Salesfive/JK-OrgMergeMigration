import type { CleanScope } from '@studio/shared';

// WHERE-Teil für einen Ersteller-/Zeitraum-Filter. Id und Datum sind schon geprüft (Schema bzw. Salesforce-Id).
export function scopeWhere(scope: CleanScope, userId: string): string {
    if (!/^[a-zA-Z0-9]{15,18}$/.test(userId)) throw new Error('Ungültige Benutzer-Id.');
    const parts: string[] = [];
    if (scope.creator === 'me') parts.push(`CreatedById = '${userId}'`);
    if (scope.since) parts.push(`CreatedDate >= ${scope.since}T00:00:00Z`);
    return parts.join(' AND ');
}

export const and = (...parts: (string | null | undefined | false)[]): string =>
    parts.filter((p): p is string => !!p).join(' AND ');
