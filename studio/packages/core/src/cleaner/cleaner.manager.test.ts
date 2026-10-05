import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CleanEvent } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { CleanerManager } from './manager';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CleanerManager', () => {
    it('puffert Ereignisse für spätere Verbindungen und setzt sie mit reset() zurück', async () => {
        const manager = new CleanerManager(await mkdtemp(path.join(tmpdir(), 'cm-')));
        manager.start(async ({ emit }) => {
            emit({ type: 'log', text: 'Case: 2 Datensätze\n' });
            emit({ type: 'end', ok: true, deleted: 2, failed: 0, stopped: false });
            return { deleted: 2, failed: 0, stopped: false };
        });
        await wait(30);
        const late: CleanEvent[] = [];
        manager.subscribe((e) => late.push(e));
        expect(late.map((e) => e.type)).toEqual(['log', 'end']);

        manager.reset();
        const afterReset: CleanEvent[] = [];
        manager.subscribe((e) => afterReset.push(e));
        expect(afterReset).toEqual([]);
    });

    it('lässt kein reset() und keinen zweiten Start zu, solange ein Auftrag läuft', async () => {
        const manager = new CleanerManager(await mkdtemp(path.join(tmpdir(), 'cm-')));
        let release: () => void = () => undefined;
        manager.start(
            () =>
                new Promise((resolve) => {
                    release = () => resolve({ deleted: 0, failed: 0, stopped: false });
                })
        );
        expect(manager.running).toBe(true);
        expect(() => manager.reset()).toThrow(/läuft/);
        expect(() =>
            manager.start(async () => ({ deleted: 0, failed: 0, stopped: false }))
        ).toThrow(/läuft bereits/);
        release();
        await wait(30);
        expect(manager.running).toBe(false);
    });
});
