# Feature: Query-Konfiguration als Baukasten

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Die Query eines Objekts soll nicht als SOQL-Textzeile gepflegt werden, sondern als Modell, aus dem das Studio die SOQL erzeugt. Darauf aufbauend prüft das Studio vor dem Lauf, ob Umfang und Beziehungen zusammenpassen.

## Problem heute

- Die Query steht als Text in der `export.json` jedes Objekts, inklusive der Readonly-Parents. `WHERE CreatedDate = LAST_N_DAYS:7` ist in fast jeder Datei einzeln hinterlegt (zum Beispiel [sfdmu/060_Opportunity/export.json](../sfdmu/060_Opportunity/export.json)). Eine Änderung des Umfangs heißt, viele Dateien von Hand anzufassen.
- Die Felder lassen sich in der GUI nur ausschließen, nicht hinzufügen.
- Der Zusammenhang zwischen Kind und Parent ist nirgends sichtbar. Das hat bereits einen echten Fehler verursacht: Klärungsliste Punkt 10 (`Pricebook2` blieb mit dem Zeitfilter leer, daher scheiterten alle PricebookEntry-Inserts). Ebenso die 37 fehlenden Parents beim Contact, die erst im Lauf auffielen.

## Konzept

Aus einem Modell wird die Query erzeugt. Handgeschriebenes SOQL bleibt als Notausgang (Rohmodus).

### 1. Felder

- Aus der bestehenden Feldtabelle (Ausschluss, Mapping) wird die Feldliste der Query.
- Neu: **Feld hinzufügen** aus dem Describe von Quelle und Ziel. Angeboten werden nur Felder, die in der Quelle lesbar und im Ziel schreibbar sind.

### 2. Filter

- Zeilen aus Feld, Operator und Wert, **typgerecht**: Datum mit Relativwerten ("letzte N Tage", "seit …"), Picklist mit Auswahl, Boolean mit Schalter, Text mit Enthält/Gleich.
- Kein freies Tippen von SOQL-Syntax im Normalfall. Werte werden beim Erzeugen escaped, Feldnamen gegen das Describe geprüft.

### 3. Umfang statt Filtertext

Jedes Objekt hat eine **Rolle**, aus der sich sein Umfang ergibt:

| Rolle | Beispiel | Umfang |
|---|---|---|
| Stammdaten | Product2, Pricebook2, PricebookEntry | immer komplett |
| Kohorte | Account | die gewählte Kohorte (siehe [Feature_Batch_Migration_Kohorten.md](Feature_Batch_Migration_Kohorten.md)) |
| Kind | Contact, Opportunity, Order … | folgt dem Parent, z. B. `AccountId IN (Kohorte)` |

Der Umfang wird einmal zentral bestimmt (Kohorte, Zeitraum, Stichprobe), nicht pro Datei. Benannte Filter wie "letzte 7 Tage" oder "Testkohorte 50 Accounts" werden einmal definiert und von mehreren Objekten verwendet.

### 4. Parents werden erzeugt, nicht geschrieben

Die Parent-Einträge vor dem Zielobjekt in der `export.json` ergeben sich aus den Lookup-Feldern des Objekts: Parent-Objekt und dessen External-ID. Sie bekommen **keinen eigenen Filter**, sondern `master: false`: SFDMU holt dann nur die Parents, auf die die Kind-Datensätze zeigen (siehe Proben unten). Heute werden sie von Hand geschrieben, mit eigenem Zeitfilter.

Pro Lookup-Feld gibt es zwei Modi, bewusst sichtbar gewählt:

| Modus | Erzeugter Parent-Eintrag | Wirkung |
|---|---|---|
| **Nur dieses Objekt** (Standard) | `Readonly`, `master: false`, kein Filter | Im Lauf wird nur das Objekt geschrieben. Parents müssen im Ziel schon existieren, sonst entstehen fehlende Parents. |
| **Parents mitziehen** | `Upsert`, `master: false`, kein Filter | Fehlende Parents werden im selben Lauf im Ziel angelegt. Der Lauf schreibt also auch das Parent-Objekt. |

Beim Mitziehen muss der Parent-Eintrag dieselben Felder, Mappings und Wertemappings verwenden wie die Konfiguration des Parent-Objekts selbst. Das spricht für das zentrale Modell statt einer Kopie pro Datei.

### 5. Prüfung vor dem Lauf (lesend gegen die Quelle)

Aus dem Modell zählt das Studio ohne Simulation:

- **Treffer je Objekt** (`SELECT COUNT() …`) und eine grobe Speicherschätzung. Wichtig wegen der Sandbox-Limits.
- **Fehlende Parents vorhersagen:** Kind-Datensätze im Umfang, deren Parent im Ziel (noch) nicht existiert, abgeglichen über die External-ID des Parents. Quelle: referenzierte Parent-Werte per Abfrage, Ziel: vorhandene Parents.
- **Warnung, wenn Parents fehlen** und der Modus "Nur dieses Objekt" ist, mit Hinweis auf Reihenfolge oder "Parents mitziehen". Der Fall von Punkt 10 (Parent-Filter zu eng) entfällt, weil Parents keinen eigenen Filter mehr haben.
- **Beispielzeilen** (die ersten fünf), um zu sehen, ob der Filter trifft.

Diese Prüfung ergänzt den Ergebnis-Tab, der Fehlende Parents erst nach einem Lauf zeigt ([GUI_Ergebnis_Tab_Idee.md](GUI_Ergebnis_Tab_Idee.md)).

## Erkenntnisse aus Simulationsproben (2026-10-02)

Contact mit 46 Quelldatensätzen, nur Simulation (nichts ins Ziel geschrieben), Wegwerf-Konfigurationen, danach gelöscht:

| Variante | Quell-Accounts geladen | Fehlende Parents | Schreibt Accounts |
|---|---|---|---|
| Bisher: Account `Readonly` mit `CreatedDate`-Filter | 26 | 36 bis 37 | nein |
| A: nur Contact, kein Account im Script | **18.830** (SFDMU ergänzt den Parent selbst, ohne Filter, lädt alle) | 36 | nein |
| B: Account `Readonly`, `master: false`, ohne Filter | **43** (nur die referenzierten) | 36 | nein |
| C: Account `Upsert`, `master: false` ("mitziehen") | 43 | **0** (33 Accounts würden angelegt) | ja |

- **Contact allein geht.** SFDMU ergänzt fehlende Parents selbst, lädt dann aber alle Accounts der Quelle (hier 18.830, im Ziel 96). Besser ist der explizit erzeugte Eintrag mit `master: false`.
- **Die 36 fehlenden Parents sind kein Query-Problem.** Sie bleiben in A und B gleich, weil diese Accounts im Ziel noch nicht existieren. Das ist eine Frage der Reihenfolge: Parents müssen vor den Kindern im Ziel sein.
- Es gibt zwei Auswege: die Parents vorher als eigenen Lauf migrieren (Umfang: die von den Kindern referenzierten Accounts) oder sie mitziehen (Variante C).
- Aus der Probe nicht abgeleitet: Auswirkungen von Validierungsregeln, Owner-Mapping und weiteren Pflichtfeldern beim Anlegen der mitgezogenen Parents.

## Speicherung

- SFDMU liest weiter die `export.json`. Die Query darin wird aus dem Modell erzeugt.
- Das Modell liegt in der geplanten versionierten `migration.config.json` ([Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md)). Die `export.json` wird dadurch zum erzeugten Artefakt.
- **Rohmodus:** Ist eine bestehende Query nicht darstellbar (Unterabfragen, ungewöhnliche Funktionen), bleibt das Objekt im Rohmodus. Das Studio überschreibt sie dann nicht und zeigt sie nur an.
- Schreiben bleibt atomar und läuft wie alle Änderungen nur über geprüfte Endpunkte.

## Oberfläche

Neuer Reiter **Query** am Objekt (neben Felder und Wertemapping):

- Erzeugte SOQL, nur lesbar, mit Kopieren.
- Filterzeilen und Umfang/Rolle.
- Schaltfläche "Prüfen": Trefferzahl, Speicherschätzung, fehlende Parents, Beispielzeilen.
- Hinweis, wenn das Objekt im Rohmodus ist.

## Schritte

1. **Query-Reiter:** erzeugte SOQL anzeigen, Feld hinzufügen, typgerechte Filter, Trefferzahl und Beispielzeilen. Rein am einzelnen Objekt, kein Eingriff in die Struktur.
2. **Umfang und Rollen** mit abgeleiteten Parents und Kindern, zusammen mit den Batch-Kohorten gebaut.
3. **Vorab-Prüfung** auf fehlende Parents je Lookup, mit Wahl zwischen "Nur dieses Objekt" und "Parents mitziehen".

## Zu klären

- Welche SOQL-Konstrukte kommen in den bestehenden Queries vor und müssen darstellbar sein? Erst alle `export.json` durchsehen, dann den Funktionsumfang des Filters festlegen.
- Wie wird die Rolle ermittelt: von Hand gesetzt oder aus Describe und Beziehungen vorgeschlagen? Empfehlung: vorschlagen, Nutzer bestätigt.
- Mehrfach-External-IDs (zum Beispiel `Name;AccountId;CloseDate` bei Opportunity) in Parent-Auflösung und Zählabfragen: wie wird ein Parent dort eindeutig bestimmt?
- Kosten der Zählabfragen: API-Aufrufe und Laufzeit gegen große Objekte. Zählen darf nur lesen und sollte begrenzt/zwischengespeichert sein.
- Zeitfilter als Testumfang: Soll der Zeitfilter künftig nur noch als Teil der Kohorten-Definition existieren statt als eigener Filter pro Objekt?
