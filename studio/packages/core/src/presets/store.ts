import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PresetSourceSchema, type PresetInfo } from '@studio/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../errors';
import { listFolders } from '../sfdmu/exportConfig';
import { writeFileAtomic } from '../util/fs';
import { sameConfig } from './compare';

const MetaSchema = z.object({
    name: z.string(),
    note: z.string().default(''),
    createdAt: z.string(),
    source: PresetSourceSchema.default('manual'),
    hasValueMapping: z.boolean().default(false)
});

const SAFE_ID = /^[\w.-]+$/;
const EXPORT = 'export.json';
const VM = 'ValueMapping.csv';

const two = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
export const slug = (name: string) =>
    name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'stand';

const exists = (file: string) =>
    stat(file).then(
        () => true,
        () => false
    );

// Gespeicherte Stände der Konfiguration eines Objekts: <Objektordner>/presets/<Datum_Zeit_Name>/
// mit export.json, ValueMapping.csv (falls vorhanden) und meta.json. SFDMU liest nur die Dateien im Objektordner,
// der Unterordner stört nicht. Die Presets gehören ins Git.
export class PresetStore {
    constructor(private readonly sfdmuDir: string) {}

    private folderDir(folder: string): string {
        if (!listFolders(this.sfdmuDir).includes(folder)) throw notFound('Unbekannter Ordner.');
        return path.join(this.sfdmuDir, folder);
    }

    private presetDir(folder: string, id: string): string {
        if (!SAFE_ID.test(id)) throw notFound('Unbekannter Stand.');
        return path.join(this.folderDir(folder), 'presets', id);
    }

    private async currentFiles(folder: string) {
        const dir = this.folderDir(folder);
        return {
            exportJson: await readFile(path.join(dir, EXPORT), 'utf8'),
            valueMapping: await readFile(path.join(dir, VM), 'utf8').catch(() => null)
        };
    }

    async list(folder: string): Promise<PresetInfo[]> {
        const root = path.join(this.folderDir(folder), 'presets');
        const ids = (await readdir(root).catch(() => []))
            .filter((i) => SAFE_ID.test(i))
            .sort()
            .reverse();
        const current = await this.currentFiles(folder);
        const out: PresetInfo[] = [];
        for (const id of ids) {
            try {
                out.push(await this.info(folder, id, current));
            } catch {
                /* Ordner ohne gültige meta.json überspringen */
            }
        }
        return out;
    }

    private async info(
        folder: string,
        id: string,
        current: { exportJson: string; valueMapping: string | null }
    ): Promise<PresetInfo> {
        const dir = this.presetDir(folder, id);
        const meta = MetaSchema.parse(
            JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'))
        );
        const exportJson = await readFile(path.join(dir, EXPORT), 'utf8');
        const valueMapping = await readFile(path.join(dir, VM), 'utf8').catch(() => null);
        return {
            id,
            ...meta,
            hasValueMapping: valueMapping !== null,
            matchesCurrent: sameConfig({ exportJson, valueMapping }, current)
        };
    }

    async get(folder: string, id: string) {
        const dir = this.presetDir(folder, id);
        if (!(await exists(path.join(dir, EXPORT)))) throw notFound('Unbekannter Stand.');
        return {
            exportJson: await readFile(path.join(dir, EXPORT), 'utf8'),
            valueMapping: await readFile(path.join(dir, VM), 'utf8').catch(() => null)
        };
    }

    async current(folder: string) {
        return this.currentFiles(folder);
    }

    // Speichert den aktuellen Stand (export.json und, falls vorhanden, ValueMapping.csv).
    async save(
        folder: string,
        input: { name: string; note?: string; source?: 'manual' | 'backup'; now?: Date }
    ): Promise<PresetInfo> {
        const name = input.name.trim();
        if (!name) throw badRequest('Name fehlt.');
        const now = input.now ?? new Date();
        const root = path.join(this.folderDir(folder), 'presets');
        let id = `${stamp(now)}_${slug(name)}`;
        for (let n = 2; await exists(path.join(root, id)); n++)
            id = `${stamp(now)}_${slug(name)}-${n}`;
        const dir = path.join(root, id);
        await mkdir(dir, { recursive: true });

        const { exportJson, valueMapping } = await this.currentFiles(folder);
        await writeFile(path.join(dir, EXPORT), exportJson);
        if (valueMapping !== null) await writeFile(path.join(dir, VM), valueMapping);
        const meta = {
            name,
            note: input.note ?? '',
            createdAt: now.toISOString(),
            source: input.source ?? 'manual',
            hasValueMapping: valueMapping !== null
        };
        await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
        return this.info(folder, id, { exportJson, valueMapping });
    }

    // Stellt einen Stand wieder her: Dateien zurück in den Objektordner. Ein Stand ohne Wertemapping entfernt die
    // Datei dort, damit der Zustand wirklich zurückkommt.
    async restore(folder: string, id: string): Promise<void> {
        const wanted = await this.get(folder, id);
        const dir = this.folderDir(folder);
        await writeFileAtomic(path.join(dir, EXPORT), wanted.exportJson);
        if (wanted.valueMapping !== null)
            await writeFileAtomic(path.join(dir, VM), wanted.valueMapping);
        else await unlink(path.join(dir, VM)).catch(() => undefined);
    }

    async delete(folder: string, id: string): Promise<void> {
        const dir = this.presetDir(folder, id);
        if (!(await exists(path.join(dir, 'meta.json')))) throw notFound('Unbekannter Stand.');
        await rm(dir, { recursive: true });
    }
}
