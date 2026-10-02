# Idee: Ergebnis-Tab in der SFDMU-GUI (Erfolge und Fehler)

Stand: 2026-10-02 · Status: Idee, noch nicht gebaut

## Ziel

Nach einem Lauf sollen Erfolge, Fehler und fehlende Parents direkt in der GUI sichtbar sein. Bisher steht alles nur im Terminal-Log und in CSV-Dateien.

## Datenquellen (schreibt SFDMU bereits)

- **Log:** Am Ende steht "DATA PROCESSING SUMMARY", zum Beispiel `Contact: Updated 17, Inserted 24`. Parsen für Kennzahlen pro Objekt.
- **`<Ordner>/target/<Objekt>_<operation>_target.csv`:** Alle Datensätze, die geschrieben werden (je Operation eine Datei), mit Spalte `Errors`. Quelle für Erfolge und Fehler pro Datensatz.
- **`<Ordner>/reports/MissingParentRecordsReport.csv`:** Datensätze, deren Parent im Ziel nicht gefunden wurde. Spalten: Lookup-Feld, fehlender External-ID-Wert, Parent-Objekt, Record-Id.
- **Warnungen im Log**, zum Beispiel "Missing in the Source and will be excluded from the migration".

## Vorschlag für die GUI

Neuer Tab neben "Felder" und "Wertemapping":

- **Kacheln:** Eingefügt, Aktualisiert, Fehler, fehlende Parents. Mit Zeitpunkt und Modus (Simulation oder Live) des Laufs.
- **Fehlertabelle:** Datensätze mit Fehlertext, Record-Id, Name oder External ID, Link in die Org, soweit eine Id vorhanden ist.
- **Fehlende Parents:** Zweite Tabelle mit Lookup-Feld und fehlendem Wert.
- **Filter** nach Fehlern und Warnungen, **CSV-Export** für die Migrationsexperten.
- **Objektliste:** Neben dem Häkchen des letzten Laufs die Anzahl der Fehler anzeigen.

## Zu klären

- **Simulation gegen Live:** Die Simulation zeigt, was geschrieben würde. Echte Salesforce-Fehler (zum Beispiel Validierungsregeln) gibt es nur im Live-Lauf. Die GUI muss beides klar kennzeichnen.
- **Inhalt der Errors-Spalte bei Live-Fehlern:** Noch nie ein Live-Lauf mit Fehlern gesehen. Die Spalte existiert, ihr genauer Inhalt ist ungeprüft. Beim ersten echten Lauf an einem harmlosen Objekt in CDEV5 verifizieren.
- **Historie:** Jeder Lauf überschreibt die letzten Ergebnisdateien. Für Vergleiche Ergebnisse pro Lauf archivieren, zum Beispiel unter `sfdmu/<Ordner>/runs/<Zeitstempel>/`, in Git ignoriert. Als zweiter Schritt.

## Reihenfolge

1. Ergebnis-Tab mit Kacheln, Fehlertabelle und fehlenden Parents.
2. Historie pro Lauf.
