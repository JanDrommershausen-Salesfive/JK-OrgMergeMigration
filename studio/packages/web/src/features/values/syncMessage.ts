import type { ValueMappingSync } from '@studio/shared';

const fileName = (file: string) => file.split('/').pop() ?? file;

// Kurzmeldung zum Abgleich mit der Mapping-Datei. Ohne always nur, wenn sich etwas getan hat.
export function syncMessage(
    s: ValueMappingSync | undefined,
    always = false
): { text: string; error: boolean } | null {
    if (!s) return null;
    if (s.error) return { text: `Wertemapping nicht übernommen: ${s.error}`, error: true };
    if (!s.file) {
        return always ? { text: 'Keine Mapping-Datei gewählt', error: true } : null;
    }
    const parts: string[] = [];
    if (s.added.length) {
        const fields = [...new Set(s.added.map((a) => a.field))].join(', ');
        parts.push(`${s.added.length} Wertemapping-Zeilen aus ${fileName(s.file)} (${fields})`);
    } else if (always) {
        parts.push(`${fileName(s.file)}: keine neuen Werte`);
    }
    if (s.conflicts.length) {
        const first = s.conflicts
            .slice(0, 3)
            .map((c) => `${c.field} „${c.from}“: CSV ${c.csv}, Datei ${c.file}`)
            .join('; ');
        parts.push(
            `${s.conflicts.length} abweichend, CSV bleibt (${first}${s.conflicts.length > 3 ? ' …' : ''})`
        );
    }
    return parts.length ? { text: parts.join(' · '), error: false } : null;
}
