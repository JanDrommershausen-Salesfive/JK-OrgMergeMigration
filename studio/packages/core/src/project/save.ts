import path from 'node:path';
import type { ProjectConfig } from '@studio/shared';
import { writeFileAtomic } from '../util/fs';
import { PROJECT_FILE } from './load';

// Schreibt migration.project.json (ohne Zugangsdaten). sfdmu/run.sh liest dieselbe Datei.
export async function saveProject(projectDir: string, project: ProjectConfig): Promise<void> {
    await writeFileAtomic(
        path.join(projectDir, PROJECT_FILE),
        JSON.stringify(project, null, 2) + '\n'
    );
}
