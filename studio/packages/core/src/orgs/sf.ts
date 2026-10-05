import { execFile } from 'node:child_process';

export interface SfResult {
    status: number;
    message?: string;
    name?: string; // Fehlername der sf-CLI, zum Beispiel FailedRecordDetailsError
    data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- bei Fehlern liefert sf hier Zusatzdaten (Job-Id)
    result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Antworten der sf-CLI sind je Befehl verschieden
}

export interface SfOptions {
    timeoutMs?: number;
    cwd?: string; // manche Befehle (bulk results) schreiben Dateien in das Arbeitsverzeichnis
}

// Ruft die sf-CLI mit --json auf. Fehler und leere Ausgaben werden zu status 1.
export function sf(args: string[], options: number | SfOptions = {}): Promise<SfResult> {
    const { timeoutMs = 60_000, cwd } =
        typeof options === 'number' ? { timeoutMs: options } : options;
    return new Promise((resolve) => {
        execFile(
            'sf',
            [...args, '--json'],
            { timeout: timeoutMs, maxBuffer: 5e6, cwd },
            (err, stdout) => {
                try {
                    resolve(JSON.parse(stdout) as SfResult);
                } catch {
                    resolve({ status: 1, message: err ? err.message : 'Keine Ausgabe von sf' });
                }
            }
        );
    });
}

// Austauschbar für Tests.
export type SfRunner = (args: string[], options?: SfOptions) => Promise<SfResult>;
