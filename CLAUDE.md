# JK-OrgMergeMigration

Datenmigration US-Org → EU-Org (JK) mit SFDMU. Salesforce-Projekt (SFDX) plus Migrations-Config.

## Dokumentation

- Alle Markdown-Dokumente (Klärungslisten, Analysen, Entscheidungen, Notizen, Übergaben) liegen im Ordner [`docs/`](docs/).
- Neue Dokumente, die auf Anfrage entstehen, immer dort ablegen — nicht im Projekt-Root und nicht in `sfdmu/`.
- Vor Antworten zu Feldabgleich, externalIds oder offenen Fragen zuerst `docs/` lesen, insbesondere
  [`docs/Klaerungsliste_US_EU_Feldabgleich_CDEV5.md`](docs/Klaerungsliste_US_EU_Feldabgleich_CDEV5.md).
- Ausnahmen: `README.md` im Root und `sfdmu/README.md` (Bedienungsanleitung) bleiben an ihrem Ort.
- Dateinamen ohne Leerzeichen, sprechend, Umlaute als ae/oe/ue.

## SFDMU

- Ein Ordner pro Objekt unter `sfdmu/` (`010_Account` …), Läufe immer nur für ein Objekt.
- Start über `sfdmu/run.sh <Ordner>` oder die GUI (`npm run sfdmu:gui`). Nie `sf sfdmu run` direkt, das umgeht die Org-Prüfungen.
- Standard ist Simulation; `--live` schreibt in CDEV5.

## Git

- Keine Co-Author-/Attribution-Zeilen in Commits und PRs.
