# Feature: ETL-Konfiguration in der GUI

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Alles, was eine Migration an Konfiguration braucht, soll gut in der GUI einstellbar sein, ohne Dateien von Hand zu bearbeiten. Die GUI schreibt weiter in die `export.json` und das Wertemapping, damit SFDMU unverändert damit arbeitet.

## Schon vorhanden

- Feldvergleich Quelle gegen Ziel.
- Feld-Mapping und Feld-Ausschlüsse (`/api/mapping`, `/api/exclude`).
- Wertemapping je Feld (`/api/valuemapping`, `ValueMapping.csv`).

## Ausbauziele

### 1. Transformationen pro Feld
- Konstanten und Default-Werte (zum Beispiel "leer → `Unbekannt`").
- Einfache Formeln und Funktionen: Trim, Groß-/Kleinschreibung, Zusammenfügen, Teilstring, Datumsformat.
- Hinweis: SFDMU kennt dafür Feld-Mapping, Wertemapping und Skript-Add-ons. Die GUI soll die Eingaben in diese Mechanismen übersetzen, statt eine eigene Engine zu bauen. Machbarkeit je Transformation prüfen.

### 2. Umgebungsprofile
- Quelle und Ziel als Profile (zum Beispiel `CDEV5`, später Full Copy, später Produktion). Siehe [Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md).
- Pro Profil unterschiedliche Werte möglich (Wertemappings, Ausschlüsse, Batchgrößen).

### 3. Reihenfolge und Abhängigkeiten
- Sichtbar und änderbar in der GUI, siehe [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md).

### 4. External-ID und Operation
- Pro Objekt External-ID-Feld und Operation (Insert, Upsert, Update, Readonly) einstellbar.
- Prüfung: Ist das Feld in der Ziel-Org als External ID oder eindeutig vorhanden, wie viele Duplikate gibt es in der Quelle?

### 5. Validierungsregeln und Automatisierung
- Vor dem Lauf anzeigen, welche Validierungsregeln, Trigger und Flows in der Ziel-Org auf das Objekt wirken und Fehler erzeugen können. Das Projekt hat dafür bereits den Skill `validate-vr`.

### 6. Konfiguration als Dokumentation
- Mapping-Übersicht pro Objekt als Export (CSV oder Markdown) für die Fachseite und die Klärungsliste.

## Prinzipien

- Eine Änderung in der GUI schreibt nur über geprüfte Endpoints in die Konfigurationsdateien, nie Freitext aus dem Browser direkt ins Dateisystem.
- Jede Änderung ist im Git sichtbar (die Dateien bleiben Klartext).
- Fachlich offene Entscheidungen landen in [Klaerungsliste_US_EU_Feldabgleich_CDEV5.md](Klaerungsliste_US_EU_Feldabgleich_CDEV5.md), nicht verstreut in der GUI.

## Zu klären

- Welche Transformationen braucht JK konkret? Erst die tatsächlichen Fälle aus der Klärungsliste sammeln, dann die Funktionsliste festlegen.
- Wo reicht SFDMU nativ, wo braucht es eine Vorverarbeitung der CSVs oder ein Add-on-Skript?
