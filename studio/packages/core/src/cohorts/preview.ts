import type { Cohort, CohortPreview, CohortPreviewRow } from '@studio/shared';
import type { QueryRunner } from '../query/check';
import { formatValue } from '../query/soql';
import { objectOf, targetObject, type ExportConfig } from '../sfdmu/exportConfig';
import { linksFor, type Lookups } from './links';
import { findPathToRoot } from './path';
import { applyCohort } from './scope';

const idList = (ids: string[]) =>
    formatValue({ kind: 'list', values: ids.map((value) => ({ kind: 'string' as const, value })) });

// Wie viele Datensätze je Objekt zur Kohorte gehören (lesend gegen die Quelle). Hilft beim Planen der Sandbox-Größe.
export async function cohortPreview(opts: {
    cohort: Cohort;
    configs: { folder: string; config: ExportConfig }[];
    lookups: Lookups;
    run: QueryRunner;
    sourceAlias: string;
}): Promise<CohortPreview> {
    const { cohort, configs, lookups, run, sourceAlias } = opts;
    const rows: CohortPreviewRow[] = [];
    for (const { folder, config } of configs) {
        const object = objectOf(targetObject(config));
        if (object === cohort.rootObject) {
            rows.push({ folder, object, scoped: true, count: cohort.count, via: 'Id', note: null });
            continue;
        }
        const scope = applyCohort(config, cohort, await linksFor(config, lookups));
        if (!scope.scoped) {
            rows.push({
                folder,
                object,
                scoped: false,
                count: null,
                via: null,
                note: scope.notes[0] ?? 'läuft ohne Einschränkung'
            });
            continue;
        }
        const found = await findPathToRoot(object, cohort.rootObject, lookups);
        if (!found) {
            rows.push({
                folder,
                object,
                scoped: true,
                count: null,
                via: null,
                note: 'Zahl nicht ermittelbar (kein einfacher Weg zum Root)'
            });
            continue;
        }
        try {
            const r = await run(
                sourceAlias,
                `SELECT COUNT() FROM ${object} WHERE ${found.path} IN ${idList(cohort.ids)}`
            );
            rows.push({
                folder,
                object,
                scoped: true,
                count: r.totalSize,
                via: found.path,
                note: null
            });
        } catch (err) {
            rows.push({
                folder,
                object,
                scoped: true,
                count: null,
                via: found.path,
                note: err instanceof Error ? err.message : String(err)
            });
        }
    }
    return { rows };
}
