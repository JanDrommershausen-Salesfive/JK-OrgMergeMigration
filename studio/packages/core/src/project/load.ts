import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProjectConfigSchema, type ProjectConfig } from '@studio/shared';

export const PROJECT_FILE = 'migration.project.json';

// Liefert null, wenn das Projekt noch nicht eingerichtet ist (dann kommt die Org-Auswahl).
export async function loadProject(projectDir: string): Promise<ProjectConfig | null> {
    let raw: string;
    try {
        raw = await readFile(path.join(projectDir, PROJECT_FILE), 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
    }
    return ProjectConfigSchema.parse(JSON.parse(raw));
}
