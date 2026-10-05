# Idee: Ergebnis-Tab in der SFDMU-GUI (Erfolge und Fehler)

Stand: 2026-10-02 · Status: Tab und Historie umgesetzt (Migration Studio), siehe Abschnitt "Umgesetzt"

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

## Umgesetzt (2026-10-02)

- **Archiv pro Lauf:** Nach jedem Lauf legt das Studio `runs/<Ordner>/<Zeitstempel>/` an (nicht im Git) mit `meta.json`, `log.txt` und Kopien von `target/` und `reports/`. Ordner und Zeitstempel sind im Zugriff geprüft (keine Pfadtricks).
- **Ergebnis-Tab** (dritter Tab am Objekt): Auswahl des Laufs (neuester zuerst), Kacheln (eingefügt, aktualisiert, Fehler, fehlende Parents, Warnungen, Dauer), Unterreiter Fehler, Fehlende Parents, Warnungen, Zusammenfassung, Log. Nach Laufende springt die GUI auf den Tab.
- **Fehlende Parents** sind dedupliziert (SFDMU wiederholt Zeilen je Durchlauf) und nach fehlendem Wert gruppiert, häufigste zuerst. Der CSV-Export enthält jeden einzelnen Datensatz.
- **Warnungen:** "Feld fehlt in der Quelle" wird zu einer Zeile zusammengefasst, die Rückfrage "Continue the job" ausgeblendet.
- **Objektliste:** zeigt neben dem Häkchen die Zahl der Fehler bzw. der Datensätze ohne Parent.
- **Simulation gegen Live:** Der Tab kennzeichnet beides; bei Simulation steht ein Hinweis, dass Salesforce-Fehler erst im Live-Lauf auftreten.
- Geprüft gegen echte Simulationsläufe (Contact: 29 eingefügt, 19 aktualisiert, 37 fehlende Parents, 11 Warnungen).

## Noch offen

- **Errors-Spalte im Live-Lauf:** Als Fehler zählt jede Zeile mit Text außer `#N/A`. Wie SFDMU echte Salesforce-Fehler dort einträgt, ist noch ungeprüft. Beim ersten Live-Lauf mit Fehlern an einem harmlosen Objekt in der Sandbox verifizieren.
- Link in die Org je Datensatz (Id der Zielorg liegt im Live-Lauf vor, in der Simulation nur eine Platzhalter-Id).
- Vergleich zweier Läufe, Aufbewahrung (Aufräumen alter Läufe), Gesamtübersicht über alle Objekte.
- Ältere Läufe von vor dem Archiv (nur `last-runs.json`) haben keine Ergebnisse.
