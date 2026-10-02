# Feature: Batchweise Migration über Kohorten

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

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
