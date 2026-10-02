import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { ProjectConfig } from '@studio/shared';
import { loadProject } from './load';

export interface OrgPin {
    alias: string;
    orgId: string;
}

export interface RunConfig {
    projectDir: string;
    sfdmuDir: string;
    name: string | null;
    docsDir: string;
    source: OrgPin | null; // null: Orgs noch nicht ausgewählt
    target: OrgPin | null;
    protectedOrgIds: string[];
    // Gesetzt, wenn eine migration.project.json aus einem anderen Ordner vorliegt (wird ignoriert).
    staleProjectPath: string | null;
}

// Quelle der Wahrheit ist migration.project.json. Ohne die Datei ist das Projekt noch nicht
// eingerichtet: Objekte sind lesbar, Orgs und Läufe erst nach der Org-Auswahl.
export async function loadRunConfig(projectDir: string): Promise<RunConfig> {
    const project = await loadProject(projectDir);
    if (!project) return unconfigured(projectDir);
    if (project.projectPath && !samePath(project.projectPath, projectDir)) {
        return { ...unconfigured(projectDir), staleProjectPath: project.projectPath };
    }
    return fromProject(projectDir, project);
}

export function realPath(p: string): string {
    try {
        return realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

const samePath = (a: string, b: string) => realPath(a) === realPath(b);

export function fromProject(projectDir: string, project: ProjectConfig): RunConfig {
    return {
        projectDir,
        sfdmuDir: path.join(projectDir, project.objectsDir),
        name: project.name,
        docsDir: project.docsDir,
        source: project.source,
        target: project.target,
        protectedOrgIds: project.protectedOrgIds,
        staleProjectPath: null
    };
}

function unconfigured(projectDir: string): RunConfig {
    return {
        projectDir,
        sfdmuDir: path.join(projectDir, 'sfdmu'),
        name: null,
        docsDir: 'docs',
        source: null,
        target: null,
        protectedOrgIds: [],
        staleProjectPath: null
    };
}
