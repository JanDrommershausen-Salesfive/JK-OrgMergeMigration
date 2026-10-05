import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CleanerRulesSchema, type CleanerRules } from '@studio/shared';

export const RULES_FILE = 'cleaner.config.json';

// Projektregeln für den Cleaner. Ohne Datei gelten keine Zusatzregeln.
export async function loadCleanerRules(projectDir: string): Promise<CleanerRules> {
    try {
        return CleanerRulesSchema.parse(
            JSON.parse(await readFile(path.join(projectDir, RULES_FILE), 'utf8'))
        );
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return CleanerRulesSchema.parse({});
        throw new Error(
            `${RULES_FILE} ist ungültig: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}
