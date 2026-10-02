# Feature: Query-Konfiguration als Baukasten

Stand: 2026-10-02 · Status: Schritt 1 umgesetzt (Query-Reiter mit Filtern, Feldern, Parent-Modus und Prüfung), Umfang/Rollen und Batches offen

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

## Umgesetzt (2026-10-02): Query-Reiter

Reiter **1 · Query** am Objekt (`/konfiguration/:objekt/query`). Die Reiter folgen dem Ablauf: **1 · Query** (was wird gelesen), **2 · Mapping** (wohin geht es, bisher "Felder"), **3 · Wertemapping** (welche Werte ändern sich). Alte Adressen `felder` und `wertemapping` leiten um.

- **Erzeugte Query** (nur lesbar, kopierbar), wie sie in `export.json` steht.
- **Filter mit UND/ODER:** Alle Bedingungen auf oberster Ebene müssen zutreffen (UND). Eine **ODER-Gruppe** verlangt, dass mindestens eine ihrer Bedingungen zutrifft, und wird als `(A OR B)` geschrieben (SOQL verlangt die Klammern). Tiefere Verschachtelungen bleiben im Textmodus. **Filter als Zeilen:** Feld, Bedingung und Wert, passend zum Feldtyp (Datum mit Relativwerten wie "letzte N Tage", Zahl, wahr/falsch, Text mit "enthält", "ist eines von", "ist leer"). Gespeichert wird erst mit "Filter speichern". Nicht darstellbare WHERE-Teile (OR, Klammern, Unterabfragen) öffnen sich als Text, "Als Text bearbeiten" gibt es zusätzlich. Der Text wird auf Semikolons, Zeilenumbrüche und offene Klammern geprüft.
- **Felder als Checkliste (Quelle):** Die Liste zeigt nur Felder, die die Quelle liefern kann (Describe der Quell-Org); abgehakt ist, was in der Query steht. Das Typ-Emoji zeigt die Art (🔤 Text, 🔢 Zahl, ✅ Ja/Nein, 🔽 Auswahlliste, 🗓️ Datum, 🔗 Lookup). Als Tabelle mit den Spalten Auswahl, Typ, API-Name, Label und Info; mit Suche, "nur ausgewählte" und "Alle/Keine sichtbaren". Id und External-ID bleiben immer drin. Beim Abwählen verschwinden auch Mapping und Ausschluss dieses Feldes. Zusammengesetzte Felder (Adresse, Ort) und Binärfelder werden nicht angeboten. Was das Ziel dazu braucht, ist bewusst **nicht** Teil der Query, sondern des Mappings.
- **Parents mit Modus-Schalter** je Parent-Eintrag: **Nur lesen** (`Readonly`, `master: false`, nur Id und External ID, kein Filter) oder **Mitziehen** (`Upsert`, `master: false`, ohne Filter, mit Feldern, Mappings, Ausschlüssen und Wertemapping aus dem Objektordner des Parents). Mitziehen verlangt eine Bestätigung und ist nur möglich, wenn der Parent eine eigene Konfiguration hat. Die Parents erscheinen als kompakte Zeilen (je ein Schalter), die Erklärung steht einmal oben. Bei Mitziehen öffnet **Felder wählen** ein Fenster mit derselben Quellfeld-Checkliste für das Parent-Objekt. Die Auswahl gilt nur für dieses Objekt. Bestehende handgeschriebene Einträge zeigen sich als "Manuell".
- **Prüfen** (lesend): Trefferzahl, die ersten fünf Datensätze und je Parent, wie viele referenzierte Datensätze im Ziel fehlen. Das entscheidet zwischen "Nur lesen" und "Mitziehen" bei begrenztem Sandbox-Speicher.

Technik: Die Query wird aus `export.json` gelesen und beim Speichern wieder dorthin geschrieben (kein zusätzliches Modell, nichts kann auseinanderlaufen). Kern: `core/src/query/` (`soql.ts` Parser und Erzeuger, `model.ts` Änderungen, `check.ts` Prüfung).

### Mapping-Reiter (Schritt 2)

- Zuerst die Feldtabelle des Hauptobjekts (Quelle → Ziel, Typvergleich, Ausschluss), darunter **Zielfelder ohne Quelle**: schreibbare Zielfelder, die kein Quellfeld befüllt. **Pflichtfelder** (im Ziel nicht leer anlegbar, ohne Standardwert) stehen zuerst und sind hervorgehoben, die Liste ist dann aufgeklappt. Das Ziel-Pflichtfeld erscheint damit erst, wenn das Mapping vorliegt, nicht schon in der Query.
- Für jeden **mitgezogenen Parent** gibt es darunter einen eigenen Abschnitt "<Objekt> (mitgezogen)" mit demselben Aufbau. Mapping und Ausschlüsse werden im Parent-Eintrag der `export.json` gespeichert und wirken nur für dieses Objekt.
- Validierungsregeln des Ziels sind aus dem Describe nicht erkennbar. Pflichtfelder erkennt das Studio, Regeln müssen weiterhin von Hand bedacht werden.

### Wertemapping je Objekt

Die frühere gemeinsame `sfdmu/ValueMapping.csv` (mit den Zeilen aller Objekte, per Lauf in jeden Ordner kopiert) ist aufgelöst. Jeder Objektordner hat eine eigene `ValueMapping.csv` mit nur den Zeilen seines Objekts. SFDMU liest sie im Lauf-Ordner, `run.sh` legt bei fehlender Datei eine leere an. Zeilen eines mitgezogenen Parents stehen in der Datei des Ordners, in dem er mitgezogen wird: Beim Umschalten auf **Mitziehen** werden sie aus dem Ordner des Parents kopiert, bei **Nur lesen** entfernt. Im Reiter **Wertemapping** gibt es wie im Mapping einen Abschnitt je mitgezogenem Parent. Die alte GUI unter `sfdmu/gui/` kennt die gemeinsame Datei nicht mehr.

### Befunde

- **Alle 16 bestehenden Queries** sind darstellbar und haben nur einfache Filter (`CreatedDate = LAST_N_DAYS:7` oder keinen). Es kommt kein OR, keine Klammer und keine Unterabfrage vor. Damit ist die Frage nach den nötigen SOQL-Konstrukten geklärt.
- **Alle Parent-Einträge** stehen aktuell als "Manuell" (kein `master: false`, mit Zeitfilter bei Account). Beim ersten Umschalten werden sie normalisiert.
- **Die Prüfung stimmt mit der SFDMU-Simulation überein:** Contact hat 46 Treffer, 43 referenzierte Accounts, 10 im Ziel, 33 fehlen (Variante C legte 33 an). Opportunity: 39 Treffer, 35 Accounts referenziert, nur 1 im Ziel, 34 fehlen; Pricebook2 vollständig vorhanden.
- **Beispielzeilen** lassen Felder aus, die es in der Quelle nicht gibt (SFDMU lässt sie ebenfalls aus).

### Noch offen

- Umfang und Rollen (Stammdaten, Kohorte, Kind) mit abgeleiteten Parents und Kindern, zusammen mit den Batch-Kohorten.
- Die Prüfung ist bei mehrteiligen External-IDs (zum Beispiel `Name;AccountId;CloseDate`) nicht möglich und meldet das. Auch bei Parent-Feldern mit Punkt-Notation.
- Mitgezogene Parents laden deren eigene Lookups (zum Beispiel `Account.ParentId`, `OwnerId`) nicht mit. Das Verhalten beim echten Anlegen (Validierungsregeln, Owner-Mapping, Pflichtfelder) ist nicht getestet.
- Eine Änderung am Parent-Modus gilt nur für diesen Objektordner. Gleichartige Parents in anderen Objekten müssen einzeln umgestellt werden.
- Die Gruppenabfrage ist auf 2.000 verschiedene Parent-Werte begrenzt, die Zahl ist dann eine Untergrenze.
