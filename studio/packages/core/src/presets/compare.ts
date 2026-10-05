export interface ConfigFiles {
    exportJson: string;
    valueMapping: string | null;
}

// Schlüssel sortiert, damit Reihenfolge und Einrückung keine Rolle spielen.
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)])
        );
    }
    return value;
}

// Kein Wertemapping und eine Datei nur mit Kopfzeile sind dasselbe.
const rows = (csv: string | null): string =>
    (csv ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(1)
        .join('\n');

export function sameConfig(a: ConfigFiles, b: ConfigFiles): boolean {
    try {
        const sameExport =
            JSON.stringify(canonical(JSON.parse(a.exportJson))) ===
            JSON.stringify(canonical(JSON.parse(b.exportJson)));
        return sameExport && rows(a.valueMapping) === rows(b.valueMapping);
    } catch {
        return false;
    }
}
