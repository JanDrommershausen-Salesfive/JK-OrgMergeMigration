# Feature: Lauf-Historie

Stand: 2026-10-02 · Status: Archiv pro Lauf umgesetzt (zentral unter `runs/<Ordner>/<Zeitstempel>/`), Vergleich und Aufräumen offen. Details: [GUI_Ergebnis_Tab_Idee.md](GUI_Ergebnis_Tab_Idee.md)

## Ziel

Jeder Lauf wird archiviert, damit Ergebnisse vergleichbar bleiben und Ergebnis-Tab und Chat auf frühere Läufe zugreifen können. Das ist die Grundlage für [GUI_Ergebnis_Tab_Idee.md](GUI_Ergebnis_Tab_Idee.md) und [GUI_Chat_mit_Claude_Code.md](GUI_Chat_mit_Claude_Code.md).

## Problem heute

SFDMU überschreibt `target/` und `reports/` bei jedem Lauf. Nur [sfdmu/gui/last-runs.json](../sfdmu/gui/last-runs.json) merkt sich pro Objekt, dass ein Lauf stattfand. Vorherige Zustände, Vergleiche und Trends sind nicht möglich.

## Vorschlag

Nach jedem Lauf legt die GUI-Logik (oder `run.sh`) einen Ordner an:

```
sfdmu/<Objektordner>/runs/<Zeitstempel>/
  meta.json        Modus (Simulation/Live), Quelle, Ziel, Batch, Dauer, Exit-Code, Kennzahlen
  log.txt          Vollständiges Terminal-Log
  target/          Kopie der *_target.csv
  reports/         Kopie der MissingParentRecordsReport.csv u. a.
```

- `runs/` kommt in `.gitignore` (enthält Kundendaten).
- `meta.json` enthält die geparsten Zahlen aus "DATA PROCESSING SUMMARY" (eingefügt, aktualisiert, Fehler, fehlende Parents), damit die Übersicht nicht jedes Mal CSVs lesen muss.
- Orchestrierte Durchläufe (siehe [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md)) erhalten eine gemeinsame Lauf-Gruppen-ID in der `meta.json`.

## Nutzen in der GUI

- Auswahl eines Laufs im Ergebnis-Tab statt nur "letzter Lauf".
- Vergleich zweier Läufe: neue und behobene Fehler, geänderte Zahlen.
- Trend pro Objekt über Batches hinweg (siehe [Feature_Batch_Migration_Kohorten.md](Feature_Batch_Migration_Kohorten.md)).
- Chat kann auf Läufe verweisen ("Was ist zwischen Lauf 1 und 2 passiert?").

## Zu klären

- Aufbewahrung: Wie viele Läufe pro Objekt, Aufräumen älterer Läufe?
- Speicherort: pro Objektordner (einfach) oder zentral unter `runs/` im Projekt (besser für Durchläufe über mehrere Objekte)?
- Kundendaten in den Archiven: Projekt-Datenschutzvorgaben beachten, Ordner nicht synchronisieren.
