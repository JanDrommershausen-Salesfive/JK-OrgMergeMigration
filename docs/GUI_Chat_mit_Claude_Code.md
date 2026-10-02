# Idee: Chat mit Claude Code in der SFDMU-GUI

Stand: 2026-10-02 · Status: Idee, noch nicht gebaut

## Ziel

In der GUI (`npm run sfdmu:gui`) ein Chatfenster, über das man Fragen zur Migration stellen kann. Es nutzt die lokal installierte Claude-Code-CLI mit dem eigenen Login, ohne Anthropic-Plattform und ohne API-Key.

## Technischer Ansatz

- Der GUI-Server startet die CLI im Projektordner nicht-interaktiv: `claude -p "<Frage>" --output-format stream-json --include-partial-messages`.
- Die Ausgabe wird live in das Chatfenster gestreamt (wie beim Terminal-Log).
- Folgefragen laufen im selben Gespräch über `--resume <session-id>`.
- In der installierten CLI geprüft: `-p`, `--output-format`, `--include-partial-messages`, `--resume`, `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--append-system-prompt`, `--add-dir` sind vorhanden.

## Kontext, den die GUI automatisch mitschickt

- Gewähltes Objekt (Ordner, Operation, External ID, Readonly-Parents).
- Ergebnis des Feldabgleichs Quelle gegen Ziel (fehlende Felder, Typabweichungen).
- Aktuelle Mappings und Ausschlüsse aus der `export.json`.
- Verweis auf `docs/` (Klärungsliste), damit bekannte Entscheidungen berücksichtigt werden.

Beispielfragen: "Welche Felder fehlen im Ziel, und was schlägst du vor?", "Warum steht Order.OpportunityId als fehlend da?", "Passt das Wertemapping für BillingCountry?"

## Sicherheitsrahmen

- Nicht-interaktiv gibt es keine Rückfrage-Dialoge. Deshalb nur lesende Werkzeuge erlauben (`Read`, `Grep`, `Glob`), Befehlsausführung sperren.
- Der Chat startet nie Läufe und schreibt nie direkt Dateien. Live-Läufe bleiben bei Toolbar und `run.sh`.
- Änderungsvorschläge erscheinen als Text oder als Button "Übernehmen". Der Button nutzt denselben geprüften Weg wie das Dropdown (`/api/mapping`, `/api/exclude`, `/api/valuemapping`). So schreibt nur die GUI-Logik in die `export.json`.
- GUI-Server bleibt auf `127.0.0.1` und prüft den Origin.
- Das Gespräch läuft lokal unter dem Konto der jeweiligen Person.

## Layout

Aufklappbares Panel neben oder unter dem Terminal, gleiches Muster wie das Terminal (standardmäßig eingeklappt).

## Offene Fragen

- Soll der Chat pro Objekt ein eigenes Gespräch haben oder ein durchgehendes?
- Werden Vorschläge als strukturierte Daten (JSON) ausgegeben, damit der Button "Übernehmen" zuverlässig funktioniert?
- Was passiert, wenn die CLI bei jemandem nicht installiert oder nicht eingeloggt ist? Die GUI sollte das erkennen und einen Hinweis zeigen, statt zu scheitern.
