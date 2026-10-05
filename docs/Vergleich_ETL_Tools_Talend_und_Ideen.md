# Vergleich: Talend und andere ETL-Tools, was wir abgucken können

Stand: 2026-10-02 · Status: Einschätzung aus Allgemeinwissen, nicht gegen aktuelle Produktdokumentation geprüft

## Einordnung

Talend (heute Qlik Talend) ist eine allgemeine Datenintegrationsplattform mit grafischem Job-Design. SFDMU ist ein auf Salesforce spezialisiertes Kommandozeilenwerkzeug. Wir bauen mit der GUI die Teile nach, die bei Salesforce-Migrationen den Unterschied machen.

## Was Talend & Co. gut machen

| Fähigkeit | Wie es dort aussieht | Übertragbar auf uns |
|---|---|---|
| **Reject-Flows** | Fehlerhafte Zeilen gehen mit Fehlergrund in einen eigenen Ausgang und lassen sich korrigiert erneut laden | Ergebnis-Tab mit "nur Fehler erneut laufen lassen" ([GUI_Ergebnis_Tab_Idee.md](GUI_Ergebnis_Tab_Idee.md)) |
| **Datenprofiling** | Füllgrad, Duplikate, Wertverteilung, ungültige Werte vor der Migration | Profil-Ansicht pro Objekt und Feld, auch als Futter für den Chat ([GUI_Chat_mit_Claude_Code.md](GUI_Chat_mit_Claude_Code.md)) |
| **Visuelles Mapping (tMap)** | Mapping, Formeln, Joins an einer Stelle | [Feature_ETL_Konfiguration.md](Feature_ETL_Konfiguration.md) |
| **Kontexte/Umgebungen** | Gleicher Job gegen Dev, Test, Prod mit Variablen | Umgebungsprofile ([Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md)) |
| **Orchestrierung** | Jobketten mit Abhängigkeiten, Wiederanlauf | [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md) |
| **Monitoring und Lineage** | Laufhistorie, Laufzeiten, Herkunft von Werten | [Feature_Lauf_Historie.md](Feature_Lauf_Historie.md) |
| **Duplikaterkennung/Matching** | Fuzzy-Matching, Zusammenführen | Offenes Thema für Account/Contact (External-ID Name/Email ist sehr einfach) |
| **Idempotenz und Wiederanlauf** | Läufe lassen sich gefahrlos wiederholen | Upsert mit External-ID, Batch-Id-Listen speichern |
| **Wiederverwendbare Bausteine** | Joblets, Schemas | Wiederverwendbare Projektvorlage ([Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md)) |

## Wo SFDMU und unsere GUI besser sind

- **Salesforce-Beziehungen:** Lookups werden über External-IDs automatisch aufgelöst, inklusive Reihenfolge und Missing-Parent-Report. In allgemeinen ETL-Tools baut man das von Hand.
- **Metadaten-Bewusstsein:** Feldabgleich Quelle gegen Ziel aus der Describe-Information.
- **Leichtgewichtig:** Keine Lizenz, kein Server, Konfiguration als Klartext im Git.
- **Org-Sicherheitsnetz:** Gepinnte Orgs, Simulation als Standard, Bestätigung vor Live.
- **Claude-Chat:** Analyse "on the fly" über Konfiguration, Ergebnisse und Klärungsliste.

## Was uns fehlt (nach Priorität)

1. Historie und Ergebnis-Tab.
2. Orchestrierung und zentrale Konfiguration.
3. Batch-Kohorten und Sandbox-Leeren für schnelle Testzyklen.
4. Reject-Reprocessing (nur fehlerhafte Datensätze erneut).
5. Profiling vor der Migration.
6. Transformationsbausteine und Duplikaterkennung.

## Weitere Werkzeuge zum Anschauen

Nur als Anregung, jeweils Funktionsumfang vor einem Vergleich prüfen: Salesforce Data Loader, Dataloader.io, Informatica Cloud, MuleSoft, Jitterbit, Skyvia, Salesforce Inspector Reloaded (für schnelle Abfragen und Exporte), Gearset Data Deploy.
