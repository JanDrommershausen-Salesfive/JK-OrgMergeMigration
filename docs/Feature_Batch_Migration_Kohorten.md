# Feature: Batchweise Migration über Kohorten

Stand: 2026-10-02 · Status: Kohorten, Vorschau und Läufe auf Kohorte umgesetzt (Seite "Kohorten"), Orchestrierung über alle Objekte und Wachstumsstufen offen

## Ziel

Es gibt noch keine Full-Copy-Sandbox. Mit den Speicher- und API-Limits der Test-Sandbox sollen trotzdem möglichst alle offenen Punkte der Migration früh gefunden werden. Dafür wird in Batches migriert, die klein anfangen und wachsen.

## Kernentscheidung: Kohorte statt Datumsfenster

Heute filtern die Abfragen nach Datum (`CreatedDate = LAST_N_DAYS:7`). Das schneidet Beziehungen auseinander: Ein Contact im Batch kann auf einen Account zeigen, der nicht im Batch liegt. Ergebnis sind Missing-Parent-Einträge (siehe `sfdmu/020_Contact/reports/MissingParentRecordsReport.csv`), die nichts mit echten Datenfehlern zu tun haben.

**Vorschlag:** Ein Batch ist eine **Kohorte ab dem Account**.
- Auswahl einer Menge von Accounts (Anfang: wenige, später mehr).
- Alle abhängigen Datensätze werden über die Beziehungen mitgenommen (Contact, Opportunity, Quote, Order, Case, Asset, Task, Event …).
- Dadurch ist jeder Batch in sich konsistent. Fehler im Batch sind echte Befunde.

Objekte ohne Account-Bezug (Product2, Pricebook2) werden vorab komplett oder nach Bedarf der Kohorte migriert.

## Batch-Definition

Pro Batch eine Regel, die der Nutzer in der GUI festlegt:

- **Stichprobe:** N zufällige Accounts.
- **Gezielte Liste:** Account-Ids oder External-IDs.
- **Fachlicher Schnitt:** zum Beispiel Land oder Geschäftsbereich (Filter auf Account-Feldern).
- **Wachsende Stufen:** 50 → 500 → 5.000 … mit Speicher- und Limitprüfung dazwischen.

Aus der Regel entsteht die Account-Id-Menge. Die Filter der Kind-Objekte werden daraus abgeleitet (`WHERE AccountId IN (…)` oder über die Parent-Kette). Die Filter werden beim Lauf in die `export.json` eingesetzt (siehe [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md)).

## Limits und Speicher

Vor jedem Batch zeigt die GUI:

- Freien Datenspeicher der Ziel-Sandbox (REST-Limits-Endpunkt bzw. Org-Info).
- Geschätzten Bedarf des Batches: Anzahl Datensätze je Objekt aus der Quelle (Count-Abfragen) mal durchschnittliche Satzgröße (grob 2 KB je Datensatz, an echten Zahlen kalibrieren).
- Verbleibende API-Aufrufe des Tages.
- Warnung oder Sperre, wenn der Batch nicht passt.

Der Typ und die Größe von CDEV5 bestimmen die Batchgrößen. Das ist noch zu klären (Developer-Sandboxen haben sehr wenig Datenspeicher).

## Ablauf pro Batch

1. Batch definieren und Vorschau (Zahlen je Objekt, Speicherbedarf).
2. Optional Sandbox leeren (siehe [Feature_Sandbox_Leeren.md](Feature_Sandbox_Leeren.md)).
3. Durchlauf über alle Objekte in Reihenfolge (Simulation, dann Live).
4. Ergebnis ansehen ([GUI_Ergebnis_Tab_Idee.md](GUI_Ergebnis_Tab_Idee.md)), Befunde in der Klärungsliste festhalten.
5. Nächsten, größeren Batch planen.

Jeder Batch ist ein Eintrag in der Lauf-Historie ([Feature_Lauf_Historie.md](Feature_Lauf_Historie.md)), damit sich Befunde zwischen Batches vergleichen lassen.

## Zu klären

- Wie viele Datensätze gibt es pro Objekt in der US-Org, und wie groß ist CDEV5 (Typ, freier Speicher)?
- Kardinalität: Wenige Accounts mit sehr vielen Kindern (Orders, Assets) können einen Batch sprengen. Braucht es ein Limit pro Account oder pro Objekt?
- Beziehungen, die nicht über Account laufen (zum Beispiel Contact → ReportsTo, Asset → Product): Wie werden diese Parents nachgeladen? Vorschlag: SFDMU-Readonly-Parent-Objekte, wie beim Contact schon genutzt.
- Eindeutige Wiederholbarkeit: Ein Batch muss bei erneutem Lauf dieselben Datensätze treffen (Id-Liste speichern, nicht erneut zufällig ziehen).

## Umgesetzt (2026-10-02): Kohorten

- **Seite "Kohorten":** Kohorten anlegen, ansehen, löschen. Zwei Arten: **zufällige Stichprobe** von N Accounts (optional mit Filter auf Account-Feldern) oder **feste Liste von Ids**. Die Auswahl liest nur aus der Quelle und wird **eingefroren** (Ids stehen in `cohorts/<id>.json`, lokal, nicht im Git). Höchstens **500** Accounts: Mit 600 Ids lief ein Probelauf, mit 2.000 lehnt Salesforce die Anfrage ab ("Request Header Fields Too Large").
- **Vorschau auf Knopfdruck:** Pro Objekt die Zahl der Datensätze in der Kohorte (lesende COUNT-Abfragen), der Weg zum Account (zum Beispiel `Opportunity.AccountId`; Verweise auf Benutzer wie `CreatedBy` werden ignoriert) und eine grobe Speicherschätzung (2 KB je Datensatz, ohne Dateien und mitgezogene Parents). Beispiel Test 20 (20 Accounts): Contact 7, Opportunity 7, Quote 1, Order 121, Asset 17, Case 35.
- **Lauf auf eine Kohorte:** Im Start-Dialog gibt es **Umfang**. Das Studio erzeugt dafür eine Konfiguration in `runs/.effective/<Ordner>.json` (die gespeicherte `export.json` bleibt unberührt) und `run.sh --export <Datei>` führt sie in einem Arbeitsordner (`sfdmu/.work/`) aus. Die Ergebnisse werden zurück in den Objektordner kopiert, das Archiv enthält zusätzlich `effective-export.json` und die Kohorte in der `meta.json`.
- **So wird die Kohorte weitergegeben (per Probe mit SFDMU belegt):** Der Account-Eintrag bekommt `WHERE Id IN (…)`, alle davon abhängigen Einträge laufen als `master: false`. SFDMU holt dann nur die dazugehörigen Datensätze, auch über zwei Stufen (Opportunity → Position) und mit eigener Aufteilung langer Listen. Die Probe lieferte genau die gezählten Mengen (10 Contacts, 15 Opportunities, 11 Positionen bei 5 Accounts).
- **Eigene Filter:** Bei einem Kohorten-Lauf entfallen die Filter der Objekte (zum Beispiel `CreatedDate = LAST_N_DAYS:7`), denn die Kohorte bestimmt den Umfang. Das Häkchen "Eigene Filter zusätzlich anwenden" behält sie.
- **Objekte, die der Kohorte nicht folgen** (Stammdaten wie Product2, Pricebook2, PricebookEntry, und Objekte ohne Account-Eintrag in der Konfiguration wie OrderItem, Task, Event, ContentVersion) starten mit einer Kohorte nicht und laufen ohne Kohorte vollständig.
- Geprüft per Simulation: Contact auf die Kohorte Test 20 liefert 7 Contacts, passend zur Vorschau.

### Kohorten-Serie (Stand 2026-10-05)

Für die ganze Org (18.831 Accounts) in Stücken: **Serie …** auf der Kohorten-Seite schneidet alle Accounts der Quelle nach `CreatedDate, Id` (älteste zuerst, Id als eindeutiger Zweitschlüssel) in feste Blöcke zu höchstens 500. Jeder Block ist eine Kohorte (`Alle Accounts 01/38` …), jede Id steckt in genau einem Block. Optional mit Filter oder mit eigener Id-Liste (Reihenfolge bleibt erhalten, Existenz wird in der Quelle geprüft). Vorschau zeigt vorher "18.831 Accounts → 38 Kohorten". Die Liste links fasst eine Serie zu einem Eintrag zusammen, "Ganze Serie löschen" entfernt alle Blöcke.

Warum 500: Gemessen mit `sf data query` gegen die Quelle gehen Id-Listen bis mindestens 650 Ids, ab 700 antwortet Salesforce mit einer HTML-Fehlerseite (die Abfrage steckt in der Adresse, die etwa 16 KB lang sein darf). 500 lässt Puffer.

### Noch offen

- Objekte ohne Account-Eintrag (OrderItem über Order, Task/Event über `WhatId`, ContentVersion) brauchen entweder Parent-Einträge in der Konfiguration oder eine automatisch erzeugte Kette.
- Orchestrierung: alle Objekte einer Kohorte in der richtigen Reihenfolge nacheinander laufen lassen, mit Abbruch bei Fehlern.
- Wachstumsstufen (50 → 500 → …) und Kohorten über 500 Accounts (Filter-Kohorte ohne Id-Liste).
- Speicher- und Limitanzeige der Ziel-Sandbox vor dem Lauf, Sandbox leeren.
