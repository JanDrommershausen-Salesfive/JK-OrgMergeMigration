import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { RunMetaSchema, type RunDetail, type RunMeta } from '@studio/shared';
import { notFound } from '../errors';
import { runsDir } from './archive';
import { readMissingParents, readTargetTable } from './csvTables';

const MAX_ROWS = 500;
const SAFE_ID = /^[\w-]+$/;

// Liest archivierte Läufe (runs/<Ordner>/<ID>/).
export class ResultStore {
    constructor(private readonly projectDir: string) {}

    private dir(folder: string, id: string): string {
        if (!SAFE_ID.test(folder) || !SAFE_ID.test(id)) throw notFound('Unbekannter Lauf.');
        return path.join(runsDir(this.projectDir, folder), id);
    }

    // Neueste zuerst.
    async list(folder: string, limit = 50): Promise<RunMeta[]> {
        if (!SAFE_ID.test(folder)) throw notFound('Unbekannter Ordner.');
        const ids = (await readdir(runsDir(this.projectDir, folder)).catch(() => []))
            .filter((i) => SAFE_ID.test(i))
            .sort()
            .reverse()
            .slice(0, limit);
        const metas = await Promise.all(ids.map((id) => this.meta(folder, id).catch(() => null)));
        return metas.filter((m): m is RunMeta => m !== null);
    }

    // Läufe aller Objekte, neueste zuerst.
    async listAll(limit = 100): Promise<RunMeta[]> {
        const folders = (await readdir(path.join(this.projectDir, 'runs')).catch(() => [])).filter(
            (f) => SAFE_ID.test(f)
        );
        const all = (await Promise.all(folders.map((f) => this.list(f, limit)))).flat();
        return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
    }

    async meta(folder: string, id: string): Promise<RunMeta> {
        try {
            return RunMetaSchema.parse(
                JSON.parse(await readFile(path.join(this.dir(folder, id), 'meta.json'), 'utf8'))
            );
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT')
                throw notFound('Unbekannter Lauf.');
            throw err;
        }
    }

    async log(folder: string, id: string): Promise<string> {
        await this.meta(folder, id);
        return readFile(path.join(this.dir(folder, id), 'log.txt'), 'utf8').catch(() => '');
    }

    async detail(folder: string, id: string): Promise<RunDetail> {
        const meta = await this.meta(folder, id);
        const { errors, missing } = await this.tables(folder, id);
        return {
            meta,
            errors: errors.slice(0, MAX_ROWS),
            errorsTotal: errors.length,
            missingParents: missing.rows.slice(0, MAX_ROWS),
            missingParentsTotal: missing.rows.length,
            missingParentGroups: missing.groups.slice(0, MAX_ROWS)
        };
    }

    // Vollständige Tabellen für den CSV-Export (ohne Zeilenlimit).
    async tables(folder: string, id: string) {
        const dir = this.dir(folder, id);
        const files = (await readdir(path.join(dir, 'target')).catch(() => [])).filter((f) =>
            f.endsWith('_target.csv')
        );
        const errors = (
            await Promise.all(
                files.map(
                    async (f) =>
                        readTargetTable(f, await readFile(path.join(dir, 'target', f), 'utf8'))
                            .errors
                )
            )
        ).flat();
        const missingText = await readFile(
            path.join(dir, 'reports', 'MissingParentRecordsReport.csv'),
            'utf8'
        ).catch(() => '');
        return { errors, missing: readMissingParents(missingText) };
    }
}
