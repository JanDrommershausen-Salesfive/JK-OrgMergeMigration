# Feature: Claude-Chat im Studio

Stand: 2026-10-05 · Status: Stufen 1 und 2 umgesetzt (Chat mit Lesewerkzeugen, Änderungsvorschläge), Stufen 3 und 4 offen. Löst die Idee-Skizze `GUI_Chat_mit_Claude_Code.md` ab.

## Ziel

Ein Chat-Overlay im Studio, mit dem man über die Migration sprechen kann: Konfigurationen erklären lassen, Fehler und Analyseergebnisse besprechen, Datensätze aus den verbundenen Orgs nachsehen und Änderungen an Query, Mapping und Wertemapping vorschlagen lassen. Claude läuft über die lokal installierte Claude-CLI mit dem eigenen Login (kein API-Key, keine Plattform). Dieselben Werkzeuge stehen auch der Claude-Session im VS Code zur Verfügung.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Verbindung zu VS Code | Der Chat nutzt die lokale Claude-CLI. Die Studio-Werkzeuge werden als MCP-Server bereitgestellt; die Claude-Session im VS Code kann denselben Server einbinden. Es gibt keine geteilte Session mit der Erweiterung. |
| Schreibrechte | Claude **schlägt** Änderungen vor, das Studio setzt sie erst nach Klick auf „Übernehmen" um. Vor jeder Übernahme wird der aktuelle Stand automatisch als Version gesichert. |

## Aufbau

```
Chat-Overlay (Web)  →  POST /api/chat (SSE)  →  ChatManager (Server)
                                                   │ startet je Nachricht
                                                   ▼
        claude -p --output-format stream-json --include-partial-messages
               --resume <Session> --strict-mcp-config --mcp-config <studio>
               --tools "" --allowedTools "mcp__studio__*"
                                                   │ stdio
                                                   ▼
                                   Studio-MCP-Server (eigener Prozess)
                                                   │ HTTP auf 127.0.0.1
                                                   ▼
                                  Studio-API (dieselben Prüfungen wie die GUI)
```

- **Studio-MCP-Server** (`studio/packages/mcp`): dünne Schicht, die nur die Studio-API aufruft. Alle Prüfungen (Org-Pinning, Validierung, Zod-Schemas) bleiben an einer Stelle. Läuft per stdio, deshalb auch aus VS Code nutzbar (`claude mcp add`). Neue Abhängigkeit: `@modelcontextprotocol/sdk`.
- **ChatManager** (core/server): startet pro Nachricht die CLI im Projektordner, streamt die Ereignisse als SSE ins Overlay, merkt sich die Session-ID für `--resume`. Ein Gespräch je Projekt, „Neues Gespräch" setzt zurück.
- **Eingebaute Werkzeuge der CLI sind aus** (`--tools ""`): kein Bash, kein Dateischreiben. Claude kann nur, was der MCP-Server anbietet.
- **Kontext** pro Nachricht automatisch: aktuelle Seite, Objekt und Konfigurationsschritt, geöffneter Lauf. Dazu ein kurzer System-Prompt (Projektregeln, Begriffe, was Claude nicht darf).

## Werkzeuge des MCP-Servers

**Lesen (immer erlaubt)**
- `list_objects`, `get_object_config` (Query, Mapping, Wertemapping, Parents)
- `get_field_comparison` (Quelle gegen Ziel, wie die Mapping-Ansicht)
- `list_runs`, `get_run_results` (Fehler, fehlende Parents, Warnungen)
- `list_todos`, `list_presets`, `diff_preset`
- `read_doc` (nur Dateien unter `docs/`, etwa die Klärungsliste)

**Datensätze lesen (nur mit Freigabe, siehe Datenschutz)**
- `soql_query(org: source|target, soql)`: nur `SELECT`, geprüft (kein DML, keine Semikolons), Obergrenze 200 Zeilen, Ausgabe gekürzt.
- `describe_object(org, object)`.

**Ändern (nur als Vorschlag)**
- `propose_change(kind, folder, payload, begründung)`: legt einen Vorschlag an und schreibt nichts. Arten: Felder hinzufügen oder entfernen, Filter, Parent-Modus, Mapping, Ausschluss, Wertemapping, To-Do-Status.
- Das Overlay zeigt den Vorschlag als Karte mit Zusammenfassung und „Übernehmen" / „Verwerfen". „Übernehmen" ruft den bestehenden geprüften Weg auf (`/api/mapping`, `/api/query/*`, `/api/valuemapping` …) und sichert vorher eine Version.

**Nie vorhanden:** Läufe starten, Org Cleaner, Orgs wechseln oder anmelden, Dateien schreiben, Befehle ausführen.

## Datenschutz

Datensätze aus den Orgs gehen an Anthropic, sobald Claude sie liest. Deshalb:
- „Datensätze lesen" ist **standardmäßig aus** und wird im Overlay pro Gespräch bewusst eingeschaltet, mit einem Hinweis auf Quelle und Ziel.
- Der Server entscheidet, nicht der Prompt: Ist die Freigabe aus, fehlen `soql_query` und `describe_object` für Datensätze im MCP-Server.
- Fehlerlisten und To-Dos enthalten Kundennamen (Beispiele); das gilt als Datenfreigabe und wird beim Einschalten genannt.
- Das Gespräch läuft unter dem Konto der Person, das Studio speichert es lokal (`chat/`, gitignoriert).

## Sicherheit

- Der Chat-Endpunkt bleibt auf `127.0.0.1`, prüft den Origin und läuft nicht, während ein Lauf oder der Cleaner arbeitet, wenn Vorschläge übernommen werden.
- SOQL wird serverseitig geparst und auf `SELECT` begrenzt; Zeilen- und Zeitlimit; kein Zugriff auf andere Orgs als die gepinnten.
- Ein Vorschlag wird beim Übernehmen erneut validiert, nicht aus dem Chattext übernommen.
- Fehlt die CLI oder ist niemand eingeloggt, zeigt das Overlay einen Hinweis mit dem nötigen Befehl, statt zu scheitern.

## Oberfläche

- Schwebender Knopf unten rechts öffnet das Overlay als Seitenleiste (gleiches Muster wie Versionen, To-Dos und Terminal), nicht abdunkelnd.
- Nachrichten streamen live; Werkzeugaufrufe erscheinen als kleine Zeilen („liest Mapping von Account …").
- Vorschläge als Karten mit „Übernehmen", Ergebnis „übernommen als Version <Name> gesichert".
- Kopfzeile: Kontext-Chip (Objekt/Lauf), Schalter „Datensätze lesen", „Neues Gespräch".

## Stand Stufe 1

- Overlay: Knopf „Claude" in der Hauptnavigation öffnet die Seitenleiste. Gespräch, Streaming, Werkzeugzeilen, Markdown-Antworten, „Neues Gespräch", „Anhalten", Hinweis bei fehlender CLI.
- Server: `ChatManager` (`core/src/chat`), Routen `/api/chat*`. Verlauf und Session-Id liegen unter `chat/` (gitignoriert). Eine Antwort läuft höchstens zehn Minuten.
- MCP-Server: `studio/packages/mcp`, nur lesend und nur GET gegen die Studio-API. Fehlerlisten werden zusammengefasst, ohne Bezeichnungen und Ids; To-Dos ohne Beispiele; `read_doc` nur für Markdown direkt unter `docs/`.
- Geprüft mit der echten CLI: Werkzeugaufrufe laufen, Shell und Dateizugriff stehen Claude nicht zur Verfügung.
- Der MCP-Server lässt sich auch in VS Code nutzen (Stufe 4 verfeinert das): `claude mcp add studio -e STUDIO_URL=http://127.0.0.1:4174 -e STUDIO_PROJECT=<Projektordner> -- node --import <studio>/node_modules/tsx/dist/loader.mjs <studio>/packages/mcp/src/index.ts`.

## Stand Stufe 2

- Sieben Vorschlagswerkzeuge: `propose_query_fields`, `propose_filters`, `propose_parent_mode`, `propose_mapping`, `propose_exclude`, `propose_value_mapping`, `propose_todo_status`. Sie nutzen dieselben Schemas wie die GUI-Routen und legen nur einen Vorschlag an (`POST /api/chat/proposals`, der einzige schreibende Aufruf des MCP-Servers).
- Im Chat erscheint eine Karte mit Titel, Einzelheiten (Felder, Regeln, Bedingungen), Begründung und „Übernehmen" / „Verwerfen". Der Status (wartet, übernommen, verworfen, fehlgeschlagen) bleibt im Verlauf.
- Beim Übernehmen sichert das Studio den Stand des Objekts als Backup-Version („Vor Chat-Änderung …"), außer er entspricht schon einer gespeicherten Version. Danach läuft derselbe Studio-Aufruf wie in der GUI, mit denselben Prüfungen (nicht während eines Laufs oder Löschauftrags). Fehler erscheinen auf der Karte.
- Danach lädt die GUI Objekte, Query, Versionen und To-Dos neu.
- Grenzen: Vorschläge liegen nur im Speicher des Servers. Nach einem Neustart lassen sich alte Karten nicht mehr übernehmen (Hinweis auf der Karte); Claude muss sie neu vorschlagen. Das Übernehmen ist per Test mit einem Studio-Ersatz geprüft, mit der echten CLI wurde nur das Anlegen eines Vorschlags ausprobiert.

## Umsetzung in Stufen

1. **Chat mit Lesewerkzeugen:** ChatManager, SSE, Overlay, MCP-Server mit den Lesewerkzeugen und Kontext. Erkennung von fehlender CLI.
2. **Vorschläge:** `propose_change`, Vorschlagskarten, Übernehmen mit Backup-Version.
3. **Datensätze:** Freigabeschalter, `soql_query`, `describe_object`.
4. **VS Code:** Anleitung und Konfiguration, um den Studio-MCP-Server in der VS-Code-Session zu nutzen.

## Offen

- Kosten und Limits laufen über das Abonnement der Person; Anzeige im Overlay ist später denkbar.
- Mehrere Gespräche je Objekt statt eines je Projekt.
- Ob Claude zusätzlich `docs/` durchsuchen darf (Read auf `docs/`) oder nur `read_doc` nutzt.
- Verhalten bei laufendem Studio-Server auf anderem Port (MCP-Server braucht die Adresse als Parameter).
