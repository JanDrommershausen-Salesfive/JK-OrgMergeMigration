# Übergabe: Migration Studio

Stand: 2026-10-05 · Branch `feature/migration-studio`

Kurzer Überblick für alle, die am Studio weiterarbeiten (Mensch oder Claude). Details stehen in den `Feature_*.md` und in [Architektur_GUI.md](Architektur_GUI.md).

## Was es gibt

- **Start:** `npm run studio` im Ordner `studio/` (Server auf Port 4174). Nach Serveränderungen neu starten.
- **Konfiguration je Objekt** als geführter Ablauf Übersicht → Query → Mapping → Wertemapping, mit Versionen (Presets in `<Objektordner>/presets/`), To-Dos und Lauf-Leiste.
- **Läufe und Ergebnisse** mit Archiv, Fehlerliste und Übernahme in die Migration-To-Do-Liste (einzeln oder alle).
- **Kohorten:** feste Mengen von Accounts, auch als **Serie** (alle Accounts nach Erstelldatum in 500er-Blöcken). Details: [Feature_Batch_Migration_Kohorten.md](Feature_Batch_Migration_Kohorten.md).
- **Tools:** Org Cleaner, Org-Limits, Migration To-Do, Query-Editor. Das Terminal ist eine Seitenleiste.
- **Claude-Chat** über die lokale Claude-CLI mit eigenem MCP-Server (`studio/packages/mcp`): liest Konfiguration, Läufe, Versionen, To-Dos und `docs/`, schlägt Änderungen und Abfragen vor, die erst nach Klick greifen. Datensätze aus den Orgs sieht Claude nicht. Details: [Feature_Claude_Chat.md](Feature_Claude_Chat.md).

## Lokale Dateien (nicht im Git)

`migration.project.json` (gepinnte Orgs), `runs/`, `cohorts/`, `todos/` (enthält Kundennamen), `chat/` (Gesprächsverlauf).

## Offen

- **Orchestrierung:** alle Objekte eines Kohorten-Blocks nacheinander laufen lassen, danach optional der Cleaner, mit Status je Block.
- **Chat Stufe 3:** Datensätze lesen mit Freigabeschalter. **Stufe 4:** Einbindung des MCP-Servers in VS Code (Befehl steht im Chat-Dokument, bisher nicht in VS Code ausprobiert).
- Start als Kachel-Dashboard ([Feature_Startseite_Kacheln.md](Feature_Startseite_Kacheln.md)), Vergleich mit anderen ETL-Tools und weitere Ideen in `Vergleich_ETL_Tools_Talend_und_Ideen.md`.
- Nicht im Branch: `sfdmu/010_Account/presets/` (Testpreset) und `studio/mockups/` (Klickdemo der Objekt-Konfiguration).
