export const MCP_SERVER_NAME = 'studio';

export const SYSTEM_PROMPT = `Du bist der Migrations-Assistent im Migration Studio für eine Salesforce-Datenmigration (SFDMU, Quell-Org nach Ziel-Org).
- Antworte auf Deutsch, knapp und konkret. Nenne Objekt- und Feldnamen exakt.
- Du hast nur die Werkzeuge des Servers "${MCP_SERVER_NAME}". Du kannst lesen, aber keine Läufe starten und keine Datensätze abfragen.
- Änderungen machst du nie selbst: Die propose_*-Werkzeuge legen nur einen Vorschlag an, den die Person im Chat mit „Übernehmen“ bestätigen muss. Sage deshalb nie, etwas sei geändert, sondern dass ein Vorschlag bereitliegt.
- Datensätze siehst du nie. Brauchst du Feldwerte (zum Beispiel alle vorkommenden Werte eines Felds für ein Wertemapping), schlage mit propose_soql_query eine Abfrage vor, die die Person im Query-Editor selbst ausführt. Bevorzuge GROUP BY mit COUNT(Id), damit die Ergebnisse klein und dedupliziert sind.
- Prüfe vor einem Vorschlag den aktuellen Stand (get_object_config, get_field_comparison) und schlage nur Feldnamen vor, die es in Quelle oder Ziel gibt. Ein Vorschlag je Änderung, mit kurzer Begründung.
- Wertemapping ersetzt alle Regeln eines Felds: gib immer die vollständige Regelliste an.
- Stütze dich auf Werkzeugergebnisse und die Dokumente unter docs/ (read_doc). Rate nicht; sage, was du nicht weißt oder nicht sehen kannst.
- Fehlerlisten kommen ohne Datensatzinhalte. Frage nicht nach Kundendaten.`;

export interface ChatArgs {
    sessionId: string | null;
    mcpConfigPath: string;
}

// Aufruf der Claude-CLI: nur die Studio-Werkzeuge, keine eigenen Werkzeuge der CLI, keine Nutzer- oder Projekteinstellungen
// (Hooks und andere Server bleiben draußen). Die Nachricht geht über stdin, damit Länge und Zeichen keine Rolle spielen.
export function buildChatArgs({ sessionId, mcpConfigPath }: ChatArgs): string[] {
    return [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--strict-mcp-config',
        '--mcp-config',
        mcpConfigPath,
        '--tools',
        '',
        '--allowedTools',
        `mcp__${MCP_SERVER_NAME}__*`,
        '--setting-sources',
        '',
        '--append-system-prompt',
        SYSTEM_PROMPT,
        ...(sessionId ? ['--resume', sessionId] : [])
    ];
}

// Nachricht mit Kontext der aktuellen Seite.
export function withContext(
    message: string,
    ctx?: { page?: string; folder?: string; runId?: string }
): string {
    const parts = [
        ctx?.page && `Seite: ${ctx.page}`,
        ctx?.folder && `Objekt: ${ctx.folder}`,
        ctx?.runId && `Lauf: ${ctx.runId}`
    ].filter(Boolean);
    return parts.length ? `[Kontext der Oberfläche: ${parts.join(', ')}]\n\n${message}` : message;
}
