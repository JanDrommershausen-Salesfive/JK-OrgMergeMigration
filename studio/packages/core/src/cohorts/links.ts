import type { DescribedField } from '@studio/shared';
import { objectOf, type ExportConfig } from '../sfdmu/exportConfig';

export type Lookups = (object: string) => Promise<Record<string, DescribedField> | null>;

// Für jedes Objekt der Konfiguration: auf welche Objekte zeigt es per Lookup?
export async function linksFor(
    config: ExportConfig,
    lookups: Lookups
): Promise<Record<string, string[]>> {
    const links: Record<string, string[]> = {};
    for (const object of new Set(config.objects.map(objectOf))) {
        const fields = (await lookups(object)) ?? {};
        links[object] = [
            ...new Set(
                Object.values(fields).flatMap((f) =>
                    f.baseType === 'reference' ? (f.referenceTo ?? []) : []
                )
            )
        ];
    }
    return links;
}
