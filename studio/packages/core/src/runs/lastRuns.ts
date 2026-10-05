import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LastRunSchema, type LastRun } from '@studio/shared';
import { z } from 'zod';
import { writeFileAtomic } from '../util/fs';

const LastRunsSchema = z.record(z.string(), LastRunSchema);

// Merkt sich pro Objektordner den letzten Lauf (runs/last-runs.json im Projekt, nicht im Git).
export class LastRunStore {
    private readonly file: string;

    constructor(projectDir: string) {
        this.file = path.join(projectDir, 'runs', 'last-runs.json');
    }

    async all(): Promise<Record<string, LastRun>> {
        try {
            return LastRunsSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
        } catch {
            return {};
        }
    }

    async set(folder: string, run: LastRun): Promise<void> {
        const all = await this.all();
        all[folder] = run;
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFileAtomic(this.file, JSON.stringify(all, null, 2));
    }
}
