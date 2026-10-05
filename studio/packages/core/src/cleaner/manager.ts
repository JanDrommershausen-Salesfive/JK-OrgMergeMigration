import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CleanEvent } from '@studio/shared';
import { conflict } from '../errors';
import type { ExecuteResult } from './execute';

// Ein Cleaner-Auftrag zugleich. Das Protokoll wird gepuffert, damit sich die GUI auch mitten im Lauf
// oder danach wieder verbinden kann (wie beim Migrationslauf).
export class CleanerManager {
    private active = false;
    private stopped = false;
    private events: CleanEvent[] = [];
    private ended: CleanEvent | null = null;
    private readonly emitter = new EventEmitter();

    constructor(private readonly projectDir: string) {
        this.emitter.setMaxListeners(50);
    }

    get running(): boolean {
        return this.active;
    }

    start(
        job: (ctx: {
            emit: (e: CleanEvent) => void;
            isStopped: () => boolean;
            workDir: string;
        }) => Promise<ExecuteResult>
    ): void {
        if (this.active) throw conflict('Es läuft bereits ein Löschauftrag.');
        this.active = true;
        this.stopped = false;
        this.events = [];
        this.ended = null;
        const stamp = new Date()
            .toISOString()
            .replace(/\.\d+Z$/, 'Z')
            .replace(/:/g, '-');
        const workDir = path.join(this.projectDir, 'runs', '.cleaner', stamp);

        const emit = (e: CleanEvent) => {
            if (e.type === 'end') this.ended = e;
            else this.events.push(e);
            this.emitter.emit('event', e);
        };
        void job({ emit, isStopped: () => this.stopped, workDir })
            .catch((err: unknown) => {
                emit({
                    type: 'log',
                    text: `Abgebrochen: ${err instanceof Error ? err.message : String(err)}\n`
                });
                emit({ type: 'end', ok: false, deleted: 0, failed: 0, stopped: false });
            })
            .finally(async () => {
                this.active = false;
                await this.archive(workDir).catch(() => undefined);
            });
    }

    // Verwirft Protokoll und Ergebnis des letzten Auftrags ("Neuer Löschlauf"). Läuft einer, geht das nicht.
    reset(): void {
        if (this.active) throw conflict('Es läuft ein Löschauftrag.');
        this.events = [];
        this.ended = null;
    }

    stop(): void {
        this.stopped = true;
    }

    // Bisheriges Protokoll sofort, danach live bis zum Ende. Rückgabe: Abmelden.
    subscribe(listener: (e: CleanEvent) => void): () => void {
        for (const e of this.events) listener(e);
        if (this.ended) {
            listener(this.ended);
            return () => undefined;
        }
        this.emitter.on('event', listener);
        return () => this.emitter.off('event', listener);
    }

    private async archive(workDir: string): Promise<void> {
        await mkdir(workDir, { recursive: true });
        const log = this.events.flatMap((e) => (e.type === 'log' ? [e.text] : [])).join('');
        await writeFile(path.join(workDir, 'log.txt'), log);
        await writeFile(path.join(workDir, 'result.json'), JSON.stringify(this.ended, null, 2));
    }
}
