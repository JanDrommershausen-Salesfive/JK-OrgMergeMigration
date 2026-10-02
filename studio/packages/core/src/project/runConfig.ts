import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from './load';

export interface RunConfig {
    projectDir: string;
    sfdmuDir: string;
    sourceAlias: string;
    targetAlias: string;
    expectedSourceId: string;
    expectedTargetId: string;
    protectedOrgIds: string[];
}

// Quelle der Wahrheit ist migration.project.json. Solange es die Datei nicht gibt,
// werden Aliase und Org-IDs weiter aus sfdmu/run.sh gelesen (Übergangslösung).
export async function loadRunConfig(projectDir: string): Promise<RunConfig> {
    const project = await loadProject(projectDir);
    if (project) {
        return {
            projectDir,
            sfdmuDir: path.join(projectDir, project.objectsDir),
            sourceAlias: project.source.alias,
            targetAlias: project.target.alias,
            expectedSourceId: project.source.orgId,
            expectedTargetId: project.target.orgId,
            protectedOrgIds: project.protectedOrgIds
        };
    }
    const sfdmuDir = path.join(projectDir, 'sfdmu');
    const script = path.join(sfdmuDir, 'run.sh');
    if (!existsSync(script)) {
        throw new Error(`Weder migration.project.json noch sfdmu/run.sh in ${projectDir}.`);
    }
    return { projectDir, sfdmuDir, ...parseRunScript(await readFile(script, 'utf8')) };
}

export function parseRunScript(sh: string) {
    const get = (name: string) => sh.match(new RegExp(`^${name}="([^"]*)"`, 'm'))?.[1] ?? '';
    const list = sh.match(/^PROD_ORG_IDS=\(([^)]*)\)/m)?.[1] ?? '';
    return {
        sourceAlias: get('SOURCE_ALIAS'),
        targetAlias: get('TARGET_ALIAS'),
        expectedSourceId: get('EXPECTED_SOURCE_ID'),
        expectedTargetId: get('EXPECTED_TARGET_ID'),
        protectedOrgIds: [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string)
    };
}
