import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { CohortSchema, type Cohort } from '@studio/shared';
import { notFound } from '../errors';
import { writeFileAtomic } from '../util/fs';

const SAFE_ID = /^[\w-]+$/;

// Kohorten liegen lokal im Projekt (cohorts/<id>.json, nicht im Git, enthalten Ids der Quelle).
export class CohortStore {
    private readonly dir: string;

    constructor(projectDir: string) {
        this.dir = path.join(projectDir, 'cohorts');
    }

    async list(): Promise<Cohort[]> {
        const files = (await readdir(this.dir).catch(() => [])).filter((f) => f.endsWith('.json'));
        const all = await Promise.all(
            files.map((f) => this.read(f.slice(0, -5)).catch(() => null))
        );
        return all
            .filter((c): c is Cohort => c !== null)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async get(id: string): Promise<Cohort> {
        if (!SAFE_ID.test(id)) throw notFound('Unbekannte Kohorte.');
        try {
            return await this.read(id);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT')
                throw notFound('Unbekannte Kohorte.');
            throw err;
        }
    }

    async save(cohort: Cohort): Promise<void> {
        await mkdir(this.dir, { recursive: true });
        await writeFileAtomic(
            path.join(this.dir, `${cohort.id}.json`),
            JSON.stringify(cohort, null, 2) + '\n'
        );
    }

    async delete(id: string): Promise<void> {
        await this.get(id);
        await unlink(path.join(this.dir, `${id}.json`));
    }

    private async read(id: string): Promise<Cohort> {
        return CohortSchema.parse(
            JSON.parse(await readFile(path.join(this.dir, `${id}.json`), 'utf8'))
        );
    }
}

// Eindeutige, lesbare ID aus Name und Zeitpunkt.
export function cohortId(name: string, now = new Date()): string {
    const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
    return `${slug || 'kohorte'}-${now.toISOString().replace(/\D/g, '').slice(2, 14)}`;
}
