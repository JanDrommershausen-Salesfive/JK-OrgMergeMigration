export interface DistinctRow {
    value: string; // leer = Feld ohne Wert
    count: number;
}

const numeric = (v: string) => v !== '' && !Number.isNaN(Number(v));

// Verschiedene Werte einer Spalte mit Häufigkeit, häufigste zuerst. Ein Ergebnis aus GROUP BY (zwei Spalten, die
// zweite lauter Zahlen) liefert die Anzahl schon mit; sonst werden die Zeilen gezählt.
export function distinctValues(columns: string[], rows: string[][], column: number): DistinctRow[] {
    const other = columns.length === 2 ? 1 - column : -1;
    const grouped = other >= 0 && rows.length > 0 && rows.every((r) => numeric(r[other] ?? ''));
    const counts = new Map<string, number>();
    for (const r of rows) {
        const v = r[column] ?? '';
        counts.set(v, (counts.get(v) ?? 0) + (grouped ? Number(r[other]) : 1));
    }
    return [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// Neue Quellwerte für das Wertemapping: ohne leeren Wert und ohne die, für die schon eine Regel besteht.
export function newMappingRows(values: DistinctRow[], existing: { from: string; to: string }[]) {
    const known = new Set(existing.map((r) => r.from));
    return values
        .filter((v) => v.value !== '' && !known.has(v.value))
        .map((v) => ({ from: v.value, to: v.value }));
}
