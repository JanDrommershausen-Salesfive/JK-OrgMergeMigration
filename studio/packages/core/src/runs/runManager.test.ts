import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RunEvent } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { LastRunStore } from './lastRuns';
import { RunManager } from './runManager';

describe('RunManager', () => {
    it('führt run.sh aus, streamt das Log und merkt sich den Lauf', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'run-'));
        await writeFile(path.join(dir, 'run.sh'), 'echo "hallo $1"\n');
        const store = new LastRunStore(dir);
        const manager = new RunManager(dir, store);

        const events: RunEvent[] = [];
        const done = new Promise<void>((resolve) =>
            manager.subscribe((e) => {
                events.push(e);
                if (e.type === 'end') resolve();
            })
        );
        manager.start('010_Account', 'simulation', 'CDEV5');
        expect(manager.status().running).toBe(true);
        expect(() => manager.start('010_Account', 'simulation', 'CDEV5')).toThrow(/bereits/);
        await done;

        const log = events.flatMap((e) => (e.type === 'log' ? [e.text] : [])).join('');
        expect(log).toContain('hallo 010_Account');
        expect(events.at(-1)).toEqual({ type: 'end', code: 0, signal: null });
        await new Promise((r) => setTimeout(r, 50));
        expect((await store.all())['010_Account']).toMatchObject({ mode: 'simulation', ok: true });
        expect(manager.status().running).toBe(false);
    });
});
