import type { LogWarning, ObjectSummaryEntry } from '@studio/shared';

export interface ParsedLog {
    summary: ObjectSummaryEntry[];
    warnings: LogWarning[];
    errors: string[];
}

// Entfernt "Warning: ", Zeitstempel und [WARNING]/[ERROR]-Marker am Zeilenanfang.
const PREFIX = /^(?:Warning: |Error: )?(?:\[(?:\d{2}:\d{2}:\d{2}\.\d{3}|WARNING|ERROR)\]\s*)*/;
const cleanLine = (line: string) => line.replace(PREFIX, '').trim();

function warningKind(message: string): LogWarning['kind'] {
    if (/Missing in the Source and will be excluded/.test(message)) return 'missing-field';
    if (/missing parent lookup records were found/.test(message)) return 'missing-parents';
    return 'other';
}

// Liest das Terminal-Log eines SFDMU-Laufs (ohne ANSI-Codes): Zusammenfassung je Objekt,
// Warnungen und Fehlerzeilen.
export function parseLog(log: string): ParsedLog {
    const lines = log.split(/\r?\n/);
    const summary: ObjectSummaryEntry[] = [];
    const warnings = new Map<string, LogWarning>();
    const errors: string[] = [];
    let inSummary = false;
    let current: ObjectSummaryEntry | null = null;

    for (const line of lines) {
        if (/={3,} DATA PROCESSING SUMMARY ={3,}/.test(line)) {
            inSummary = true;
            continue;
        }
        if (inSummary && /={3,} [A-Z ]+ ={3,}/.test(line)) inSummary = false;

        if (inSummary) {
            const head = line.match(/\{(\w+)\} Totally processed (\d+) records/);
            if (head) {
                current = { object: head[1] as string, processed: Number(head[2]), passes: [] };
                summary.push(current);
                continue;
            }
            const pass = line.match(
                /PASS (\d+): (?:Updated (\d+), Deleted (\d+), Inserted (\d+)|None)\./
            );
            if (pass && current) {
                current.passes.push({
                    pass: Number(pass[1]),
                    updated: Number(pass[2] ?? 0),
                    deleted: Number(pass[3] ?? 0),
                    inserted: Number(pass[4] ?? 0)
                });
            }
            continue;
        }

        if (line.includes('[WARNING]')) {
            const message = cleanLine(line);
            if (!message || /^Continue the job/.test(message)) continue; // Rückfrage, die --noprompt beantwortet
            const known = warnings.get(message);
            if (known) known.count++;
            else warnings.set(message, { kind: warningKind(message), message, count: 1 });
        } else if (/\[ERROR\]|^(Error|ABORT):/.test(line.trim())) {
            errors.push(cleanLine(line));
        }
    }
    return { summary, warnings: [...warnings.values()], errors };
}

export function sumSummary(summary: ObjectSummaryEntry[]) {
    const total = { inserted: 0, updated: 0, deleted: 0 };
    for (const entry of summary) {
        for (const p of entry.passes) {
            total.inserted += p.inserted;
            total.updated += p.updated;
            total.deleted += p.deleted;
        }
    }
    return total;
}
