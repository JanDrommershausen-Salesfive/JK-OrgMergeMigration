import { execFile } from 'node:child_process';

export interface SfResult {
    status: number;
    message?: string;
    result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Antworten der sf-CLI sind je Befehl verschieden
}

// Ruft die sf-CLI mit --json auf. Fehler und leere Ausgaben werden zu status 1.
export function sf(args: string[], timeoutMs = 60_000): Promise<SfResult> {
    return new Promise((resolve) => {
        execFile(
            'sf',
            [...args, '--json'],
            { timeout: timeoutMs, maxBuffer: 5e6 },
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
