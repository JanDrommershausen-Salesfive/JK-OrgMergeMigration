import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunMeta, RunMode } from '@studio/shared';
import { readMissingParents, readTargetTable } from './csvTables';
import { parseLog, sumSummary } from './parseLog';

export interface FinishedRun {
    projectDir: string;
    sfdmuDir: string;
    folder: string;
    object: string;
    mode: RunMode;
    sourceAlias: string;
    targetAlias: string;
    startedAt: Date;
    endedAt: Date;
    exitCode: number | null;
    signal: string | null;
    stopped: boolean;
    log: string;
}

export const runsDir = (projectDir: string, folder: string) =>
    path.join(projectDir, 'runs', folder);

// Eindeutige, sortierbare ID aus dem Startzeitpunkt (UTC).
export const runId = (d: Date) =>
    d
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
        .replace(/:/g, '-');

const listFiles = async (dir: string, suffix: string): Promise<string[]> =>
    (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(suffix));

// Sichert Log und Ergebnisdateien eines Laufs unter runs/<Ordner>/<ID>/ und liefert die Kennzahlen.
// Die Dateien in <Ordner>/target und <Ordner>/reports werden beim nächsten Lauf überschrieben.
export async function archiveRun(run: FinishedRun): Promise<RunMeta> {
    const id = runId(run.startedAt);
    const dest = path.join(runsDir(run.projectDir, run.folder), id);
    await mkdir(dest, { recursive: true });

    const source = path.join(run.sfdmuDir, run.folder);
    for (const sub of ['target', 'reports']) {
        await cp(path.join(source, sub), path.join(dest, sub), { recursive: true }).catch(
            () => undefined // SFDMU legt die Ordner nur an, wenn etwas geschrieben wurde
        );
    }

    const parsed = parseLog(run.log);
    let errors = 0;
    for (const f of await listFiles(path.join(dest, 'target'), '_target.csv')) {
        const text = await readFile(path.join(dest, 'target', f), 'utf8');
        errors += readTargetTable(f, text).errors.length;
    }
    const missing = await readFile(
        path.join(dest, 'reports', 'MissingParentRecordsReport.csv'),
        'utf8'
    ).catch(() => '');
    const totals = sumSummary(parsed.summary);

    const meta: RunMeta = {
        id,
        folder: run.folder,
        object: run.object,
        mode: run.mode,
        startedAt: run.startedAt.toISOString(),
        endedAt: run.endedAt.toISOString(),
        durationMs: run.endedAt.getTime() - run.startedAt.getTime(),
        ok: run.exitCode === 0 && !run.signal,
        stopped: run.stopped,
        exitCode: run.exitCode,
        signal: run.signal,
        sourceAlias: run.sourceAlias,
        targetAlias: run.targetAlias,
        counts: {
            ...totals,
            errors,
            missingParents: readMissingParents(missing).rows.length,
            warnings: parsed.warnings.length
        },
        summary: parsed.summary,
        warnings: parsed.warnings,
        logErrors: parsed.errors.slice(0, 20)
    };
    await writeFile(path.join(dest, 'log.txt'), run.log);
    await writeFile(path.join(dest, 'meta.json'), JSON.stringify(meta, null, 2));
    return meta;
}
