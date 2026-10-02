import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { RunEvent, RunMeta, RunMode, RunStatus } from '@studio/shared';
import { conflict } from '../errors';
import type { LastRunStore } from './lastRuns';

// eslint-disable-next-line no-control-regex -- ANSI-Farbcodes aus dem Terminal-Log entfernen
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

interface ActiveRun {
    folder: string;
    mode: RunMode;
    child: ChildProcess;
    stopped: boolean;
    startedAt: Date;
    options: RunOptions;
}

// Optionen für einen Lauf mit generierter Konfiguration (zum Beispiel auf eine Kohorte beschränkt).
export interface RunOptions {
    exportFile?: string;
    cohort?: { id: string; name: string; count: number };
}

export interface RunEnd {
    options: RunOptions;
    folder: string;
    mode: RunMode;
    startedAt: Date;
    endedAt: Date;
    exitCode: number | null;
    signal: string | null;
    stopped: boolean;
    log: string;
}

// Wird nach jedem Lauf aufgerufen (Archivieren); null, wenn nichts archiviert werden konnte.
export type RunFinisher = (run: RunEnd) => Promise<RunMeta | null>;

// Führt genau einen Lauf zugleich aus (sfdmu/run.sh). Das Log wird zwischengespeichert,
// damit sich die GUI auch mitten im Lauf oder danach wieder verbinden kann.
export class RunManager {
    private active: ActiveRun | null = null;
    private log = '';
    private ended: RunEvent | null = null;
    private readonly emitter = new EventEmitter();

    constructor(
        private readonly sfdmuDir: string,
        private readonly store: LastRunStore,
        private readonly finish: RunFinisher = async () => null
    ) {
        this.emitter.setMaxListeners(50);
    }

    status(): RunStatus {
        return {
            running: this.active !== null,
            folder: this.active?.folder ?? null,
            mode: this.active?.mode ?? null
        };
    }

    // Startet run.sh. Bei --live beantwortet der Server die Abfrage von run.sh mit dem Ziel-Alias.
    start(folder: string, mode: RunMode, targetAlias: string, options: RunOptions = {}): void {
        if (this.active) throw conflict('Es läuft bereits ein Lauf.');
        const live = mode === 'live';
        const args = [
            'run.sh',
            folder,
            ...(live ? ['--live'] : []),
            ...(options.exportFile ? ['--export', options.exportFile] : [])
        ];
        const child = spawn('bash', args, { cwd: this.sfdmuDir, detached: true });
        const run: ActiveRun = {
            folder,
            mode,
            child,
            stopped: false,
            startedAt: new Date(),
            options
        };
        this.active = run;
        this.ended = null;
        this.log = '';
        this.append(`$ ./${args.join(' ')}\n\n`);

        if (live) child.stdin?.write(`${targetAlias}\n`);
        child.stdin?.end();
        const out = (chunk: Buffer) => this.append(chunk.toString().replace(ANSI, ''));
        child.stdout?.on('data', out);
        child.stderr?.on('data', out);
        child.on('error', (err) => this.append(`\nStart fehlgeschlagen: ${err.message}\n`));
        child.on('close', (code, signal) => {
            this.active = null;
            this.append(
                `\n--- beendet (${signal ? 'Signal ' + signal : 'Exit-Code ' + code}) ---\n`
            );
            void this.complete(run, code, signal);
        });
    }

    // Archiviert den Lauf, merkt ihn sich und meldet das Ende erst danach,
    // damit die GUI beim Aktualisieren das Ergebnis schon findet.
    private async complete(run: ActiveRun, code: number | null, signal: string | null) {
        const endedAt = new Date();
        const ok = code === 0 && !signal;
        const meta = await this.finish({
            options: run.options,
            folder: run.folder,
            mode: run.mode,
            startedAt: run.startedAt,
            endedAt,
            exitCode: code,
            signal,
            stopped: run.stopped,
            log: this.log
        }).catch(() => null);
        await this.store
            .set(run.folder, {
                at: endedAt.toISOString(),
                mode: run.mode,
                ok,
                stopped: run.stopped,
                ...(meta
                    ? {
                          inserted: meta.counts.inserted,
                          updated: meta.counts.updated,
                          errors: meta.counts.errors,
                          missingParents: meta.counts.missingParents,
                          runId: meta.id
                      }
                    : {})
            })
            .catch(() => undefined);
        this.ended = { type: 'end', code, signal };
        this.emitter.emit('event', this.ended);
    }

    stop(): void {
        const run = this.active;
        if (!run?.child.pid) return;
        run.stopped = true;
        process.kill(-run.child.pid, 'SIGTERM');
    }

    // Liefert das bisherige Log sofort und danach alle neuen Ereignisse. Rückgabe: Abmelden.
    subscribe(listener: (event: RunEvent) => void): () => void {
        if (this.log) listener({ type: 'log', text: this.log });
        if (this.ended) {
            listener(this.ended);
            return () => undefined;
        }
        this.emitter.on('event', listener);
        return () => this.emitter.off('event', listener);
    }

    private append(text: string): void {
        this.log += text;
        this.emitter.emit('event', { type: 'log', text } satisfies RunEvent);
    }
}
