# Feature: Org Cleaner (Sandbox leeren)

Stand: 2026-10-05 · Status: umgesetzt (Tools → Org Cleaner). Erster echter Löschlauf in CDEV5 durchgeführt: 54 Cases, 50 Entitlements und 49 von 50 Accounts gelöscht, ein Account blieb wegen Closed-Won-Opportunities stehen (jetzt als eingebaute Regel abgedeckt).

## Ziel

Die Ziel-Sandbox hat wenig Speicher. Für Testzyklen (laden, prüfen, löschen, laden) soll sie sich schnell und gefahrlos von den migrierten Daten befreien lassen, auch wenn Abhängigkeiten das Löschen blockieren (zum Beispiel Cases, Orders und Entitlements am Account).

## Was Salesforce dazu sagt (Dokumentation)

- **Papierkorb:** Gelöschte Datensätze liegen 15 Tage im Papierkorb und **zählen nicht zum Datenspeicher**. Sie bremsen aber die Datenbank bei großen Mengen. Das Bulk API 2.0 kennt deshalb einen **Hard Delete**, der den Papierkorb umgeht (Berechtigung "Bulk API Hard Delete"). Eine frühere Fassung dieses Dokuments behauptete das Gegenteil und war falsch.
- **Account löschen:** Kontakte, Opportunities, Contracts (nicht aktiviert), Aktivitäten, Notizen und Anhänge werden mitgelöscht. Es verhindern das Löschen unter anderem: zugehörige **Cases**, Opportunities anderer Besitzer, aktive Contracts, Portal-Kontakte und Kontakte, die einer Order als Bill-To-Contact dienen.
- **Closed-Won-Opportunities:** Ein Account, dessen Closed-Won-Opportunities dem Löschenden gehören, lässt sich nicht löschen; die Opportunities müssen mit weg. Opportunities anderer Besitzer blockieren ebenfalls. Das ist Standardverhalten, kein Flow, und steht im Describe nicht als `restrictedDelete`. Meldung im UI: "… because some opportunities in that account were closed won".
- **Orders:** Nur Orders im Status Draft lassen sich löschen. Aktivierte Orders müssen vorher auf Draft gesetzt werden, Positionen aktivierter Orders lassen sich nicht löschen.
- **Hinweis zu `restrictedDelete`:** Das Describe eines Objekts nennt seine Kind-Beziehungen und markiert die, die das Löschen verhindern. Für Account in CDEV5 sind das Case, Contract, Order, Entitlement, ServiceContract, ServiceResource, RecordAlert, GoalAssignment und zwei Einwilligungsobjekte.

## So arbeitet der Cleaner

1. **Umfang wählen:** Standard ist **nur von mir angelegte Datensätze** (Ersteller = Benutzer des Ziel-Alias), optional ab einem Datum. Das schützt Daten, die mit der Sandbox kamen. In CDEV5 liegen zum Beispiel 96 Accounts von fünf Erstellern, 2.022 Cases, 18.164 Produkte und 56.101 Preiseinträge. "Alle Datensätze" ist möglich, aber deutlich gekennzeichnet.
2. **Objekte wählen:** die Migrationsobjekte aus den Objektordnern.
3. **Plan berechnen** (liest nur): Reihenfolge Kinder vor Eltern (Migrationsreihenfolge rückwärts), je Objekt die Zahl der Datensätze im Umfang. Dazu **Blocker**: Objekte, die laut Describe das Löschen eines Objekts im Plan verhindern und im Umfang Datensätze haben, kommen automatisch davor. Beispiel aus CDEV5: 50 Entitlements blockieren das Löschen der Accounts. Die Berechnung dauert etwa eine Minute (viele Zählabfragen, fünf gleichzeitig).
4. **Löschen:** Der Alias der Ziel-Org muss eingetippt werden. Der Plan wird dabei frisch berechnet. Ausgeführt wird pro Schritt: Ids abfragen, per Bulk API 2.0 löschen (Hard Delete, bei fehlender Berechtigung normal), Rest zählen. Bis zu **drei Durchläufe**: Was beim ersten Mal an einer Abhängigkeit scheiterte, wird erneut versucht, sobald andere Schritte Datensätze entfernt haben. Fortschritt und Protokoll erscheinen live, der Auftrag lässt sich anhalten.

### Sonderfälle

- **ContentVersion:** wird über ContentDocument gelöscht (löscht alle Versionen).
- **Pricebook2:** das Standard-Preisbuch bleibt (nicht löschbar).
- **Order:** aktivierte Orders werden zuerst auf Draft gesetzt.

### Eingebaute Regeln

Zusätzlich zu `restrictedDelete` kennt der Cleaner Regeln, die Salesforce vorgibt, aber nicht im Describe meldet. Heute: **Opportunity.AccountId blockiert Account** (Closed Won), unabhängig vom Ersteller. Die Opportunities kommen automatisch vor den Account in den Plan, auch wenn sie nicht als Objekt gewählt sind. Per `exclude` in der Projektdatei lässt sich das abschalten.

## Projektregeln: cleaner.config.json

Projektspezifisches, das Salesforce nicht meldet, steht in `cleaner.config.json` im Projektordner (versioniert):

```json
{
  "exclude": [],
  "blockers": [
    { "object": "Entitlement", "field": "AccountId", "blocks": "Account", "anyCreator": true,
      "note": "wird beim Anlegen eines Accounts automatisch erzeugt" }
  ]
}
```

- **blockers:** Objekte, die das Löschen eines anderen verhindern und immer in den Plan gehören. `anyCreator: true` löscht sie unabhängig vom Ersteller, sinnvoll für Datensätze, die Automatisierung beim Anlegen erzeugt (zum Beispiel das Entitlement mit dem Namen des Accounts). Die Regel gilt nur für Datensätze, die an Accounts im Umfang hängen.
- **exclude:** Objekte, die der Cleaner nie anfasst, zum Beispiel Stammdaten, die bleiben sollen.
- **defaultScope** (optional): Voreinstellung für den Umfang.
- Die Regeln erscheinen im Formular unter "Projektregeln".

Weitere Blocker dieses Projekts (zum Beispiel durch Trigger oder Validierungsregeln, die das Löschen verhindern) trägst du hier ein, sobald sie auffallen. Die Fehlermeldung beim Löschen nennt meist das blockierende Objekt.

## Sicherheit

- Gelöscht wird **nur in der gepinnten Ziel-Org**, nie in der Quelle. Die Org kommt nicht aus der Anfrage, sondern aus `migration.project.json`.
- Das Ziel muss eine **Sandbox** sein und darf nicht als geschützt gelten; die gepinnte Org-ID muss zum Alias passen (dieselben Prüfungen wie beim Live-Lauf).
- **Alias eintippen** zur Bestätigung, serverseitig geprüft. Der Plan wird beim Start neu berechnet, nicht aus der Anfrage übernommen.
- Während eines Migrationslaufs läuft kein Löschauftrag und umgekehrt.
- Protokoll und Ergebnis jedes Auftrags liegen lokal unter `runs/.cleaner/<Zeitstempel>/`.

## Noch offen

- **Echter Löschlauf** noch nicht gegen CDEV5 ausgeführt. Erster Test sinnvoll mit kleinem Umfang (ein Objekt, ab heutigem Datum).
- Blocker über mehr als eine Stufe (Blocker des Blockers) und Fehler durch Trigger, Flows oder Validierungsregeln beim Löschen.
- Löschen als Schritt eines Testzyklus (Kohorte laden → prüfen → löschen) an einer Stelle.
- Speicheranzeige der Ziel-Sandbox vor und nach dem Löschen.
