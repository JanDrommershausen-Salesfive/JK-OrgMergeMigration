# Architektur der Migrations-GUI

Stand: 2026-10-02 · Status: Entwurf zur Abstimmung, noch nichts umgesetzt

## Ausgangslage

- [sfdmu/gui/server.js](../sfdmu/gui/server.js) (476 Zeilen, reines Node ohne Abhängigkeiten) und [sfdmu/gui/index.html](../sfdmu/gui/index.html) (546 Zeilen mit CSS und JS in einer Datei).
- Das trägt einen Prototyp, aber nicht die geplanten Features: Ergebnis-Tab, Historie, Chat, Batches, Sandbox-Leeren, ETL-Konfiguration, Org-Auswahl (siehe die `Feature_*.md` in diesem Ordner).
- Ziel: Von Anfang an so aufbauen, dass keine Datei zum Monolithen wird und das Werkzeug in anderen Projekten einsetzbar ist ([Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md)).

## Leitprinzipien

1. **Kern ohne Oberfläche.** Alle Logik (Läufe, Batches, Sicherheitsprüfungen, Parsen der Ergebnisse) liegt in einer Bibliothek ohne HTTP und ohne UI. Server, GUI und eventuell eine CLI sind nur dünne Schichten darüber. So ist der Kern testbar.
2. **Ein Vertrag zwischen Server und GUI.** Typen und Schemas der API liegen an einer Stelle und werden von beiden Seiten genutzt.
3. **Ein Modul pro Feature**, in Server und GUI gleich benannt (`runs`, `orgs`, `batches`, `results`, `chat` …). Ein neues Feature berührt wenige, klar benannte Ordner.
4. **Schreibzugriffe nur über den Server-Kern.** Die GUI schreibt nie Dateien oder startet Prozesse. Alles läuft über geprüfte Endpunkte (wie in [GUI_Chat_mit_Claude_Code.md](GUI_Chat_mit_Claude_Code.md) beschrieben).
5. **Konfiguration und Daten gehören zum Projekt, nicht zum Werkzeug.**

## Vorgeschlagene Technik

| Schicht | Wahl | Grund |
|---|---|---|
| Sprache | TypeScript überall | Gemeinsame Typen für API und GUI, weniger Laufzeitfehler bei wachsender Komplexität |
| Server | Node 20, Fastify | Schlank, gute Typunterstützung, Plugins pro Modul, Streaming (SSE) für Logs und Chat |
| Validierung | zod (Schemas teilen sich Server und GUI) | Eingaben und Dateien (`export.json`, `migration.config.json`) werden geprüft, bevor sie geschrieben werden |
| GUI | Vite + React + TypeScript | Größtes Ökosystem für Tabellen, Diffs und Graphen, viele Beispiele |
| GUI-Daten | TanStack Query (Server-Zustand), Zustand/Context nur für lokalen UI-Zustand | Trennt Serverdaten von Bedienzustand, Live-Updates per SSE |
| Tabellen | TanStack Table | Fehlerlisten, Feldvergleich, Filter, Export |
| Styling | CSS-Module oder Tailwind, Design-Tokens an einer Stelle | Kein CSS in Komponenten kopieren |
| Tests | Vitest (Kern, Server, Komponenten), Playwright für wenige End-to-End-Pfade | Sicherheitslogik muss Tests haben |
| Werkzeuge | ESLint + Prettier (bestehender Husky/lint-staged-Ablauf wird erweitert) | Konsistenz |

Alternative zur GUI-Wahl: **Lit** (Web Components), dem Salesforce-LWC-Modell am ähnlichsten und ohne großes Framework. Nachteil: kleineres Ökosystem für Tabellen und Diffs. Svelte wäre die schlankste Variante. Empfehlung bleibt React wegen Ökosystem und Verfügbarkeit von Bibliotheken.

## Ordnerstruktur

Eigener Bereich im Repo, bewusst **nicht** unter `sfdmu/`, damit er später in ein eigenes Repo wandern kann:

```
studio/
  package.json            npm Workspaces
  packages/
    shared/               Typen, zod-Schemas, Konstanten (API-Vertrag)
    core/                 Fachlogik ohne HTTP/UI
      src/
        orgs/             Org-Liste, Auswahl, Pinnen, Sicherheitsprüfungen
        project/          Projektkonfiguration lesen/schreiben
        sfdmu/            export.json lesen/schreiben, Feldvergleich, Mappings
        runs/             Lauf starten/stoppen, Log, Historie, Orchestrierung
        batches/          Kohorten-Auswahl, Limit- und Speicherprüfung
        results/          Parser für Summary, target-CSVs, Missing-Parents
        sandbox/          Leeren mit Schutzregeln
        chat/             Claude-CLI-Anbindung, Kontextaufbau
    server/               Fastify: Routen pro Modul, SSE, Origin-/Host-Prüfung
      src/
        routes/           orgs.ts, runs.ts, results.ts, batches.ts …
        index.ts
    web/                  Vite + React
      src/
        features/         orgs/, runs/, results/, batches/, mapping/, chat/ …
        components/       Wiederverwendbare UI-Bausteine (Tabelle, Kachel, Log)
        api/              Typisierter Client (aus shared)
        app/              Layout, Routing, Provider
        styles/           Tokens, Basis
  tests/e2e/
```

Regeln:
- `web` importiert nur `shared`, nie `core` oder `server`.
- `server` enthält keine Fachlogik, nur Routen, die `core` aufrufen.
- `core` kennt weder Fastify noch React.
- Dateigröße als Faustregel: Komponenten und Module unter ca. 200–300 Zeilen. Wird eine Datei größer, wird sie aufgeteilt.

## Laufzeit und Kommunikation

- Eine Node-Anwendung: Fastify liefert die gebaute GUI (`web/dist`) und die API unter `/api`. Im Entwicklungsmodus läuft Vite mit Proxy auf den Server.
- Bindung nur an `127.0.0.1`, Origin- und Host-Prüfung (heute schon so) bleibt.
- **Live-Daten per SSE:** Lauf-Log, Fortschritt von Orchestrierung und Batches, Chat-Antworten. Einfacher als WebSockets, reicht für Einweg-Streams.
- **Ein Lauf zugleich** pro Projekt (wie heute), als Zustand im Kern, nicht in der Route.
- API-Beispiel: `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs`, `GET /api/runs/:id/events` (SSE), `POST /api/orgs/pin`, `POST /api/batches`, `POST /api/sandbox/wipe` (mit Vorschau und Bestätigung).

## Verhältnis zu `run.sh`

- [CLAUDE.md](../CLAUDE.md) legt fest, dass Läufe über `run.sh` oder die GUI starten, nie `sf sfdmu run` direkt. Das gilt weiter.
- Schritt 1: `core/runs` ruft `run.sh` auf, wie heute. Aliase und IDs wandern aus dem Skript in die Projektkonfiguration, `run.sh` liest sie von dort.
- Schritt 2 (später, falls gewünscht): Die Org-Prüfungen werden nach TypeScript in `core/orgs` verlegt (testbar), und `run.sh` ruft nur noch einen dünnen Prüfschritt auf. Es gibt dann **eine** Quelle der Wahrheit für die Sicherheitsregeln, nicht zwei.

## Daten und Speicherorte

- **Projektdaten im Projekt:** `migration.project.json`, `migration.config.json`, Objektordner, `docs/`.
- **Läufe:** `runs/` im Projekt, in Git ignoriert (siehe [Feature_Lauf_Historie.md](Feature_Lauf_Historie.md)).
- **Zugangsdaten:** keine eigenen. Nur die `sf`-CLI hält Tokens.
- Dateien werden **atomar** geschrieben (temporäre Datei, dann umbenennen), damit ein Abbruch nie eine halbe `export.json` hinterlässt.

## Migrationspfad vom Prototyp

1. Neuen Ordner `studio/` mit Workspaces, Vite, Fastify, Vitest, ESLint und Prettier aufsetzen. Ein leeres Gerüst, das startet.
2. Bestehende Funktionen aus `server.js` nach `core` verschieben (Orgs, Describe/Feldvergleich, Mapping, Exclude, Wertemapping, Run) und mit Tests absichern.
3. Bestehende Oberfläche in React-Features nachbauen (Objektliste, Felder, Wertemapping, Terminal). Das alte `sfdmu/gui/` bleibt bis zur Gleichheit, dann entfernen.
4. Erst danach neue Features (Ergebnis-Tab, Historie, Org-Auswahl usw.).

Der Umbau ist klein, solange der Prototyp klein ist. Jede Woche später wird er teurer.

## Entscheidungen (2026-10-02)

- **GUI-Framework:** React.
- **Styling:** Tailwind, Design-Tokens an einer Stelle.
- **Ort:** `studio/` im JK-Repo, ist der Root der GUI. Nichts JK-Spezifisches im Code.
- **Sicherheitslogik:** Gleich nach TypeScript (`core/orgs`), `run.sh` ruft nur noch einen dünnen Prüfschritt auf.
- **Name:** Arbeitstitel "Migration Studio", spätere Umbenennung ist günstig (Name steht nur in Ordner, Paketen und GUI-Titel).

## Voraussetzungen

- Nur Node und npm (vorhanden). Alles andere kommt über `npm install` ins Projekt, nichts global.
- Node 20.15 ist für Vite 7 zu alt (braucht 20.19 oder neuer). Entweder Vite 6 verwenden oder Node aktualisieren.

## Weiter offen

- **Build/Start:** `npm run studio` (baut und startet) und `npm run studio:dev` (Vite + Server mit Hot Reload).

## Navigation der GUI (2026-10-02)

Hauptnavigation oben, jede Ansicht hat eine eigene Adresse (React Router), damit Neuladen, "Zurück" und Links funktionieren. Der Server liefert für alle Adressen außer `/api` die GUI aus.

| Bereich | Adresse | Inhalt |
|---|---|---|
| Übersicht | `/` | Ein Blick auf den letzten Lauf jedes Objekts, Lauf starten |
| Konfiguration | `/konfiguration/:objekt/felder`, `…/wertemapping` | Objektliste, Feldvergleich und Mapping, Wertemapping |
| Läufe | `/laeufe/:objekt/:lauf?ansicht=fehler` | Läufe aller Objekte (filterbar), Details mit Kacheln als Umschalter |

- **Lauf starten** läuft über einen Dialog mit bewusster Wahl von Simulation oder Live (Live mit eigener Bestätigung), von Übersicht und Konfiguration aus.
- **Nach Laufende** erscheint ein Hinweis mit Link zum Ergebnis, statt automatisch umzuschalten. Das Terminal bleibt auf jeder Seite unten.
- **Ordner:** `pages/` (eine Datei je Adresse), `features/<bereich>/` (Bausteine), `app/` (Layout und Routen). Die Seitenstruktur ist erweiterbar um Batches, Sandbox und Chat als weitere Bereiche.
