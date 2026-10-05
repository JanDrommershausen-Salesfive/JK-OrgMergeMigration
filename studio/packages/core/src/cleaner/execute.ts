import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CleanEvent, CleanPlan, CleanStep } from '@studio/shared';
import type { SfResult, SfRunner } from '../orgs/sf';
import type { QueryRunner } from '../query/check';
import { parseCsv } from '../sfdmu/csv';
import { and } from './scope';

const CHUNK = 10_000;
const WAIT_MINUTES = 20;
const MAX_PASSES = 3;

export interface ExecuteOptions {
    plan: CleanPlan;
    alias: string;
    hardDelete: boolean;
    run: QueryRunner; // lesende Abfragen gegen das Ziel
    sf: SfRunner;
    workDir: string; // CSV-Dateien und Ergebnisdateien der Bulk-Aufträge
    emit: (event: CleanEvent) => void;
    isStopped: () => boolean;
}

export interface ExecuteResult {
    deleted: number;
    failed: number;
    stopped: boolean;
}

interface BulkOutcome {
    processed: number;
    failed: number;
    errors: Map<string, number>; // Fehlercode → Anzahl
    fatal: string | null; // Auftrag konnte nicht ausgeführt werden
}

const countSoql = (object: string, where: string) =>
    `SELECT COUNT() FROM ${object}${where ? ` WHERE ${where}` : ''}`;

// Liest das Ergebnis eines Bulk-Auftrags. Läuft er nur teilweise durch, beendet sich die CLI mit einem Fehler
// (FailedRecordDetailsError); Job-Id und Zahlen stehen dann in data bzw. im Befehl "bulk results".
export async function readOutcome(
    res: SfResult,
    opts: { sf: SfRunner; alias: string; workDir: string; sent: number }
): Promise<BulkOutcome> {
    const jobId: string | undefined =
        res.data?.jobId ?? res.result?.jobInfo?.id ?? res.result?.jobId ?? res.result?.id;
    const fatal = res.status !== 0 && res.name !== 'FailedRecordDetailsError';
    if (fatal) {
        const line = (res.message ?? 'Auftrag fehlgeschlagen').split('\n').find((l) => l.trim());
        return {
            processed: 0,
            failed: opts.sent,
            errors: new Map(),
            fatal: line?.trim() ?? 'Auftrag fehlgeschlagen'
        };
    }
    if (!jobId) return { processed: opts.sent, failed: 0, errors: new Map(), fatal: null };

    const results = await opts.sf(['data', 'bulk', 'results', '-i', jobId, '-o', opts.alias], {
        cwd: opts.workDir
    });
    const r = results.result ?? {};
    const failed = Number(r.failedRecords ?? 0);
    const processed = Number(r.processedRecords ?? opts.sent);
    const errors = new Map<string, number>();
    if (failed > 0) {
        const file = path.join(opts.workDir, r.failedFilePath ?? `${jobId}-failed-records.csv`);
        const rows = parseCsv(await readFile(file, 'utf8').catch(() => ''));
        const col = rows[0]?.indexOf('sf__Error') ?? -1;
        for (const row of rows.slice(1)) {
            const message = col >= 0 ? (row[col] ?? '') : '';
            const code = message.split(':')[0] || 'UNBEKANNT';
            errors.set(code, (errors.get(code) ?? 0) + 1);
        }
    }
    return { processed, failed, errors, fatal: null };
}

const logLine = (emit: ExecuteOptions['emit'], text: string) =>
    emit({ type: 'log', text: `${text}\n` });

// Führt den Plan aus: Schritt für Schritt Ids abfragen und per Bulk API 2.0 löschen. Mehrere Durchläufe, weil
// sich Abhängigkeiten erst auflösen, wenn andere Schritte Datensätze entfernt haben.
export async function executePlan(opts: ExecuteOptions): Promise<ExecuteResult> {
    const { plan, alias, run, emit } = opts;
    await mkdir(opts.workDir, { recursive: true });
    let hard = opts.hardDelete;
    let deleted = 0;
    let failed = 0;
    const perStep = new Map<number, { deleted: number; failed: number }>();

    const bulk = async (
        verb: 'delete' | 'update',
        object: string,
        file: string,
        sent: number
    ): Promise<BulkOutcome> => {
        const args = [
            'data',
            verb,
            'bulk',
            '-s',
            object,
            '-f',
            file,
            '-o',
            alias,
            '--wait',
            String(WAIT_MINUTES)
        ];
        if (verb === 'delete' && hard) args.push('--hard-delete');
        let res = await opts.sf(args, {
            timeoutMs: (WAIT_MINUTES + 5) * 60_000,
            cwd: opts.workDir
        });
        // Ohne die Berechtigung "Bulk API Hard Delete" weicht der Lauf auf normales Löschen aus (Papierkorb zählt nicht zum Speicher).
        if (
            verb === 'delete' &&
            hard &&
            res.status !== 0 &&
            res.name !== 'FailedRecordDetailsError' &&
            /hard.?delete|insufficient|permission/i.test(res.message ?? '')
        ) {
            logLine(
                emit,
                'Hard Delete ist nicht erlaubt (Berechtigung "Bulk API Hard Delete" fehlt): lösche in den Papierkorb.'
            );
            hard = false;
            res = await opts.sf(
                args.filter((a) => a !== '--hard-delete'),
                { timeoutMs: (WAIT_MINUTES + 5) * 60_000, cwd: opts.workDir }
            );
        }
        return readOutcome(res, { sf: opts.sf, alias, workDir: opts.workDir, sent });
    };

    const ids = async (object: string, where: string): Promise<string[]> =>
        (
            await run(
                alias,
                `SELECT Id FROM ${object}${where ? ` WHERE ${where}` : ''} LIMIT ${CHUNK}`
            )
        ).records.map((r) => String(r.Id));

    const deactivateOrders = async (step: CleanStep, chunkFile: string) => {
        const statuses = (
            await run(alias, "SELECT ApiName FROM OrderStatus WHERE StatusCode = 'Activated'")
        ).records.map((r) => String(r.ApiName));
        const draft = (
            await run(alias, "SELECT ApiName FROM OrderStatus WHERE StatusCode = 'Draft'")
        ).records[0]?.ApiName;
        if (!statuses.length || !draft) return;
        const quoted = statuses.map((s) => `'${s.replace(/'/g, "\\'")}'`).join(', ');
        const active = await ids('Order', and(step.where, `Status IN (${quoted})`));
        if (!active.length) return;
        await writeFile(
            chunkFile,
            `Id,Status\n${active.map((id) => `${id},${String(draft)}`).join('\n')}\n`
        );
        logLine(emit, `Order: ${active.length} aktivierte Orders auf Draft setzen …`);
        const out = await bulk('update', 'Order', chunkFile, active.length);
        if (out.fatal) logLine(emit, `Order deaktivieren fehlgeschlagen: ${out.fatal}`);
    };

    let stopped = false;
    for (let pass = 1; pass <= MAX_PASSES && !stopped; pass++) {
        let progress = 0;
        if (pass > 1) logLine(emit, `\nDurchlauf ${pass}: Reste erneut versuchen`);
        for (const step of plan.steps) {
            if (opts.isStopped()) {
                stopped = true;
                break;
            }
            const before = await run(alias, countSoql(step.object, step.where)).then(
                (r) => r.totalSize
            );
            if (before === 0) {
                const known = perStep.get(step.order);
                if (pass === 1) {
                    emit({
                        type: 'step',
                        order: step.order,
                        object: step.label,
                        state: 'skipped',
                        deleted: 0,
                        failed: 0,
                        remaining: 0
                    });
                } else if (known && known.failed > 0) {
                    // Rest aus dem ersten Durchlauf hat sich inzwischen aufgelöst.
                    known.failed = 0;
                    emit({
                        type: 'step',
                        order: step.order,
                        object: step.label,
                        state: 'done',
                        deleted: known.deleted,
                        failed: 0,
                        remaining: 0
                    });
                }
                continue;
            }
            emit({
                type: 'step',
                order: step.order,
                object: step.label,
                state: 'running',
                deleted: perStep.get(step.order)?.deleted ?? 0,
                failed: 0,
                remaining: before
            });
            logLine(
                emit,
                `${step.label}${step.object !== step.label ? ` (${step.object})` : ''}: ${before} Datensätze`
            );

            const acc = perStep.get(step.order) ?? { deleted: 0, failed: 0 };
            let stepFailed = 0;
            const errors = new Map<string, number>();
            for (;;) {
                if (opts.isStopped()) {
                    stopped = true;
                    break;
                }
                const file = path.join(opts.workDir, `${pass}-${step.order}-${step.object}.csv`);
                if (step.prepare === 'deactivate-orders')
                    await deactivateOrders(
                        step,
                        path.join(opts.workDir, `${pass}-${step.order}-deactivate.csv`)
                    );
                const batch = await ids(step.object, step.where);
                if (!batch.length) break;
                await writeFile(file, `Id\n${batch.join('\n')}\n`);
                const out = await bulk('delete', step.object, file, batch.length);
                if (out.fatal) {
                    logLine(emit, `  Fehler: ${out.fatal}`);
                    stepFailed += batch.length;
                    break;
                }
                const ok = out.processed - out.failed;
                acc.deleted += ok;
                deleted += ok;
                progress += ok;
                stepFailed += out.failed;
                for (const [code, n] of out.errors) errors.set(code, (errors.get(code) ?? 0) + n);
                logLine(
                    emit,
                    `  ${ok} gelöscht${out.failed ? `, ${out.failed} fehlgeschlagen` : ''}`
                );
                if (ok === 0 || batch.length < CHUNK) break;
            }
            for (const [code, n] of errors) logLine(emit, `  ${n}× ${code}`);
            acc.failed = stepFailed;
            perStep.set(step.order, acc);
            const remaining = await run(alias, countSoql(step.object, step.where))
                .then((r) => r.totalSize)
                .catch(() => null);
            emit({
                type: 'step',
                order: step.order,
                object: step.label,
                state: remaining === 0 ? 'done' : acc.deleted > 0 ? 'partial' : 'failed',
                deleted: acc.deleted,
                failed: remaining ?? acc.failed,
                remaining
            });
        }
        if (progress === 0) break;
    }
    for (const v of perStep.values()) failed += v.failed;
    emit({ type: 'end', ok: failed === 0 && !stopped, deleted, failed, stopped });
    return { deleted, failed, stopped };
}
