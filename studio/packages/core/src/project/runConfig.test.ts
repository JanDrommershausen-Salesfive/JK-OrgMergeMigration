import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_FILE } from './load';
import { loadRunConfig, realPath } from './runConfig';

describe('loadRunConfig', () => {
    it('liefert ohne Projektdatei eine Konfiguration ohne Orgs', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'cfg-'));
        const c = await loadRunConfig(dir);
        expect(c.source).toBeNull();
        expect(c.target).toBeNull();
        expect(c.sfdmuDir).toBe(path.join(dir, 'sfdmu'));
    });

    it('liest Orgs und geschützte IDs aus der Projektdatei', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'cfg-'));
        await writeFile(
            path.join(dir, PROJECT_FILE),
            JSON.stringify({
                name: 'T',
                source: { alias: 'a', orgId: '00D000000000001' },
                target: { alias: 'b', orgId: '00D000000000002' },
                protectedOrgIds: ['00D000000000001'],
                objectsDir: 'migration'
            })
        );
        const c = await loadRunConfig(dir);
        expect(c.target?.alias).toBe('b');
        expect(c.protectedOrgIds).toEqual(['00D000000000001']);
        expect(c.sfdmuDir).toBe(path.join(dir, 'migration'));
    });

    it('ignoriert eine Datei, die aus einem anderen Ordner stammt', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'cfg-'));
        await writeFile(
            path.join(dir, PROJECT_FILE),
            JSON.stringify({
                name: 'Alt',
                projectPath: '/irgendwo/anders',
                source: { alias: 'a', orgId: '00D000000000001' },
                target: { alias: 'b', orgId: '00D000000000002' }
            })
        );
        const c = await loadRunConfig(dir);
        expect(c.source).toBeNull();
        expect(c.staleProjectPath).toBe('/irgendwo/anders');
    });

    it('akzeptiert die Datei, wenn der Pfad passt', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'cfg-'));
        await writeFile(
            path.join(dir, PROJECT_FILE),
            JSON.stringify({
                name: 'Neu',
                projectPath: realPath(dir),
                source: { alias: 'a', orgId: '00D000000000001' },
                target: { alias: 'b', orgId: '00D000000000002' }
            })
        );
        expect((await loadRunConfig(dir)).source?.alias).toBe('a');
    });
});
