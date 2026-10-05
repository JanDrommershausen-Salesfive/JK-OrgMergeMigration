# Feature: Zentrale Konfiguration und Orchestrierung

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Objektreihenfolge, Abhängigkeiten und Filter an einer Stelle pflegen und daraus die `export.json` pro Objekt erzeugen. Dazu ein Lauf über mehrere Objekte in der richtigen Reihenfolge, wobei jeder Schritt weiter ein Einzellauf über `run.sh` bleibt.

## Problem heute

- Filter stehen als Text in jeder `export.json`, zum Beispiel `WHERE CreatedDate = LAST_N_DAYS:7`. Für Batches (siehe [Feature_Batch_Migration_Kohorten.md](Feature_Batch_Migration_Kohorten.md)) müsste man alle Dateien von Hand ändern.
- Die Reihenfolge steckt nur in den Ordnernamen (010, 020 …). Abhängigkeiten (Contact braucht Account) sind nirgends beschrieben.
- Es gibt keinen Weg, "alles in Reihenfolge" zu starten.

## Vorschlag

### Konfigurationsdatei

`migration.config.json` im Projekt (neben der Projektkonfiguration, siehe [Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md)):

```json
{
  "objects": [
    { "folder": "010_Account", "sobject": "Account", "operation": "Upsert", "externalId": "Name", "dependsOn": [] },
    { "folder": "020_Contact", "sobject": "Contact", "operation": "Upsert", "externalId": "Email", "dependsOn": ["Account"] }
  ]
}
```

- Felder, Mappings und Ausschlüsse bleiben wie heute in der `export.json` (die GUI schreibt sie dort bereits).
- Der Scope-Filter (WHERE-Klausel) kommt künftig aus der Batch-Definition und wird beim Lauf in die `export.json` eingesetzt. Die Datei bleibt das, was SFDMU liest.

### Orchestrierung

- Neue Funktion "Alle Objekte laufen lassen" in der GUI. Sortiert nach `dependsOn`, ruft `run.sh <Ordner>` nacheinander auf.
- Abbruch bei Fehler oder bei fehlenden Parents über einer Schwelle, Fortsetzen ab dem Objekt, bei dem abgebrochen wurde.
- Jeder Schritt bleibt ein eigener Lauf mit eigener Historie (siehe [Feature_Lauf_Historie.md](Feature_Lauf_Historie.md)).
- Simulation oder Live gilt für den ganzen Durchlauf und wird oben deutlich angezeigt.

### Abhängigkeitsgraph

- Einfache Darstellung der Reihenfolge und der Lookup-Beziehungen in der GUI.
- Warnung, wenn ein Objekt vor seinem Parent läuft.

## Zu klären

- Soll die Konfigurationsdatei die einzige Quelle für die Reihenfolge sein und die Ordnernamen nur noch Anzeige?
- Wie werden Abhängigkeiten ermittelt: von Hand gepflegt oder aus der Salesforce-Describe (Lookup-Felder) vorgeschlagen? Empfehlung: Vorschlag aus Describe, Bestätigung durch den Nutzer.
- Muss die Regel in [CLAUDE.md](../CLAUDE.md) ("Läufe immer nur für ein Objekt") angepasst werden? Vorschlag: neu formulieren zu "jeder Schritt ist ein Einzellauf über `run.sh`, die Orchestrierung ruft nur diese auf".
