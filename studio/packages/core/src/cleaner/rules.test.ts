import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES_FILE, loadCleanerRules } from './rules';

describe('loadCleanerRules', () => {
    it('liefert ohne Datei leere Regeln', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'rules-'));
        expect(await loadCleanerRules(dir)).toEqual({ exclude: [], blockers: [] });
    });

    it('liest Regeln und ergänzt Standardwerte', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'rules-'));
        await writeFile(
            path.join(dir, RULES_FILE),
            JSON.stringify({
                exclude: ['Product2'],
                blockers: [{ object: 'Entitlement', field: 'AccountId', blocks: 'Account' }]
            })
        );
        const rules = await loadCleanerRules(dir);
        expect(rules.exclude).toEqual(['Product2']);
        expect(rules.blockers[0]).toMatchObject({ anyCreator: false });
    });

    it('lehnt ungültige Regeln mit verständlicher Meldung ab', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'rules-'));
        await writeFile(
            path.join(dir, RULES_FILE),
            JSON.stringify({ blockers: [{ object: 'x; DROP', field: 'a', blocks: 'b' }] })
        );
        await expect(loadCleanerRules(dir)).rejects.toThrow(/cleaner.config.json ist ungültig/);
    });
});
