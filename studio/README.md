# Migration Studio

GUI und Logik für Salesforce-Datenmigrationen mit SFDMU. Architektur und Entscheidungen: [docs/Architektur_GUI.md](../docs/Architektur_GUI.md).

## Start

Aus dem Repo-Root:

- `npm --prefix studio install` (einmalig)
- `npm run studio` baut die GUI und startet den Server auf http://127.0.0.1:4174
- `npm run studio:dev` startet Server und Vite mit Hot Reload auf http://127.0.0.1:5173

Anderes Projekt: `npm --prefix studio run start -w @studio/server -- --project <Pfad>`.

## Pakete

| Paket             | Aufgabe                                                         |
| ----------------- | --------------------------------------------------------------- |
| `packages/shared` | Typen und zod-Schemas, der Vertrag zwischen Server und GUI      |
| `packages/core`   | Fachlogik ohne HTTP und UI (Orgs, Läufe, Batches, Ergebnisse …) |
| `packages/server` | Fastify-Routen, rufen nur `core` auf                            |
| `packages/web`    | React, Tailwind, TanStack Query/Table                           |

Regeln (per ESLint erzwungen): `web` importiert nur `shared`; `core` kennt weder Server noch React.

## Befehle (im Ordner `studio/`)

`npm test` · `npm run lint` · `npm run typecheck` · `npm run format`

## Hinweise

- Node 20.15 genügt. Die Abhängigkeiten sind bewusst auf Versionen gepinnt, die damit laufen (Vite 6, Vitest 3, ESLint 9, happy-dom).
- Der Server bindet nur an 127.0.0.1 und prüft Host und Origin.
