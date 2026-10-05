import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject, PROJECT_FILE } from './load';

describe('loadProject', () => {
    it('liefert null ohne Projektdatei', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'studio-'));
        expect(await loadProject(dir)).toBeNull();
    });

    it('liest und ergänzt Defaults', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'studio-'));
        const config = {
            name: 'Test',
            source: { alias: 'a', orgId: '00D000000000001' },
            target: { alias: 'b', orgId: '00D000000000002' }
        };
        await writeFile(path.join(dir, PROJECT_FILE), JSON.stringify(config));
        const project = await loadProject(dir);
        expect(project?.objectsDir).toBe('sfdmu');
        expect(project?.protectedOrgIds).toEqual([]);
    });
});
