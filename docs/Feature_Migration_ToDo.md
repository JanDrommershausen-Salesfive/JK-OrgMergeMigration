# Feature: Migration To-Do (Fehler kategorisieren und sammeln)

Stand: 2026-10-05 · Status: Konzept, Umsetzung des Kerns beginnt

## Ziel

Die Ergebnisseite zeigt Fehler eines Laufs pro Datensatz. Bei vielen Datensätzen wiederholt sich derselbe Fehler (zum Beispiel ungültiger Billing State). Das Feature fasst gleiche Fehler zusammen, ordnet sie einer Kategorie zu, schlägt eine Lösung vor und sammelt alles in einer Liste unter Tools → Migration To-Do. So wird aus "6 Fehler in Account" eine überschaubare Aufgabenliste.

## Ablauf

1. Auf der Ergebnisseite eines Laufs steht der Knopf **"In To-Do übernehmen"** (nur bewusst, nie automatisch, damit Simulationsläufe die Liste nicht füllen).
2. Der Server liest die Fehler und fehlenden Parents des Laufs, normalisiert, kategorisiert und dedupliziert sie und führt sie mit der bestehenden Liste zusammen.
3. Die Seite Tools → Migration To-Do zeigt die Liste, filterbar nach Objekt und Status.

## Bausteine

### Normalisieren und Deduplizieren

Aus jedem Fehler entsteht ein Fingerabdruck aus Objekt, Kategorie, betroffenem Feld und bereinigter Meldung. Entfernt werden Ids, Zahlen, Namen und Werte in Anführungszeichen. Beispiel: "There's a problem with this state … : Billing State/Province" ergibt bei drei Datensätzen einen Eintrag mit Anzahl 3. "Shipping State/Province" ist ein eigener Eintrag.

Je Eintrag wird gespeichert: Anzahl im letzten übernommenen Lauf, bis zu drei Beispiele (Bezeichnung, Id), erster und letzter Lauf mit Zeitpunkt.

### Kategorisieren

Eine Regeltabelle aus Mustern (reine Funktionen, testbar):

| Kategorie | Erkennung (Beispiele) |
|---|---|
| Ungültiger State | "problem with this state", "select a state from the list of valid states" |
| Land fehlt für State | "country/territory must be specified before specifying a state" |
| Picklist-Wert ungültig | `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`, "bad value for restricted picklist" |
| Pflichtfeld fehlt | `REQUIRED_FIELD_MISSING` |
| Validierungsregel | `FIELD_CUSTOM_VALIDATION_EXCEPTION` |
| Duplikat | `DUPLICATE_VALUE`, `DUPLICATES_DETECTED` |
| Text zu lang | `STRING_TOO_LONG` |
| Lookup/Parent fehlt | `INVALID_CROSS_REFERENCE_KEY`, fehlende Parents aus dem Report |
| Zeile gesperrt | `UNABLE_TO_LOCK_ROW` |
| Nicht klassifiziert | alles andere, mit der bereinigten Meldung als Fingerabdruck |

Nichts geht verloren: Was kein Muster trifft, steht unter "Nicht klassifiziert".

### Lösungsvorschläge

Je Kategorie eine Vorlage mit Platzhaltern für Objekt und Feld, plus Link in den passenden Konfigurationsschritt (zum Beispiel Wertemapping mit `?feld=BillingState`). Später optional: Claude formuliert Vorschläge für "Nicht klassifiziert". Dabei gehen nur bereinigte Meldungen hinaus, nie Datensatzinhalte.

### Speicherung

**Lokal, nicht im Git** (`todos/migration-todos.json` im Projektordner, gitignoriert). Die Beispiele enthalten Kundennamen. Eine externe Datenbank für Teamarbeit ist später denkbar; deshalb steht der Zugriff hinter einer kleinen Schnittstelle (`TodoStore`), die sich austauschen lässt.

### Lebenszyklus

- Status: offen, in Arbeit, erledigt, wird nicht behoben. Dazu eine Notiz.
- Wird ein Lauf übernommen, werden bestehende Einträge anhand des Fingerabdrucks aktualisiert (Anzahl, letzter Lauf), neue angelegt. Ein erledigter Eintrag, der wieder auftaucht, geht auf offen.
- Später: Ein Eintrag, der im neuesten Lauf des Objekts nicht mehr vorkommt, wird als "vermutlich erledigt" markiert.

## Technik

- `shared/src/todos.ts`: Schemas (Eintrag, Liste, Übernahme, Statusänderung).
- `core/src/todos/`: `normalize.ts`, `classify.ts` (Regeln und Vorlagen), `merge.ts`, `store.ts`.
- `Studio`-Facade: `importRunToTodos`, `listTodos`, `updateTodo`, `deleteTodo`. Routen unter `/api/todos`.
- Web: Seite `pages/TodosPage.tsx` unter `/tools/todos`, Kachel in Tools, Knopf in der Ergebnisansicht.

## Offen

- Fehler aus Salesforce-Triggern und Flows haben freien Text; die Regeln wachsen mit den Läufen.
- Zuständige Person je Eintrag (erst sinnvoll mit gemeinsamer Datenbank).
- Verknüpfung mit der Klärungsliste in `docs/`.
