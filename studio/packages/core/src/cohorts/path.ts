import type { DescribedField } from '@studio/shared';

export interface Hop {
    field: string; // Lookup-Feld am aktuellen Objekt
    relationship: string; // Name der Beziehung, zum Beispiel Opportunity
    to: string; // Objekt, auf das es zeigt
}

type Lookups = (object: string) => Promise<Record<string, DescribedField> | null>;

const MAX_DEPTH = 3;

// Verweise auf Benutzer und Gruppen (Anleger, Besitzer) führen nie zum fachlichen Root.
const SKIP_TARGETS = new Set(['User', 'Group', 'Name', 'Profile', 'Organization']);

// Kürzester Weg über Lookups von object bis zum Root-Objekt (BFS). Bei gleich langen Wegen gewinnt AccountId.
// Ergebnis: Pfad für ein WHERE, zum Beispiel "AccountId" oder "Order.AccountId", sonst null.
export async function findPathToRoot(
    object: string,
    root: string,
    lookups: Lookups
): Promise<{ path: string; hops: Hop[] } | null> {
    let frontier: { object: string; hops: Hop[] }[] = [{ object, hops: [] }];
    const seen = new Set([object]);
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        const next: typeof frontier = [];
        for (const node of frontier) {
            const fields = await lookups(node.object);
            if (!fields) continue;
            const edges = Object.entries(fields)
                .filter(([, f]) => f.baseType === 'reference' && f.relationshipName)
                .flatMap(([name, f]) =>
                    (f.referenceTo ?? [])
                        .filter((to) => !SKIP_TARGETS.has(to))
                        .map((to) => ({
                            field: name,
                            relationship: f.relationshipName as string,
                            to
                        }))
                )
                .sort(
                    (a, b) =>
                        Number(b.field === 'AccountId') - Number(a.field === 'AccountId') ||
                        a.field.localeCompare(b.field)
                );
            for (const e of edges) {
                const hops = [...node.hops, e];
                if (e.to === root) return { path: toPath(hops), hops };
                if (!seen.has(e.to)) {
                    seen.add(e.to);
                    next.push({ object: e.to, hops });
                }
            }
        }
        frontier = next;
    }
    return null;
}

// Beziehungen davor, Lookup-Feld zuletzt: [Order.AccountId] aus den Hops OrderId → AccountId.
export const toPath = (hops: Hop[]): string =>
    [...hops.slice(0, -1).map((h) => h.relationship), hops[hops.length - 1]?.field].join('.');
