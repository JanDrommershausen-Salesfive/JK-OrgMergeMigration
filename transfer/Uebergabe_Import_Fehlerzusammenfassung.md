# Übergabe: Fehlerzusammenfassung Re-Import US-Org → FullCopy

Stand: 19.11.2026. Gilt für den Re-Import vom 12. bis 16.11.2026 von `us-prod` in die Sandbox `FullCopy` (jk-group--fullcopy). Objekte: Opportunity, OpportunityLineItem (OLI), Quote, QuoteLineItem (QLI), Order, OrderItem, Asset, Case, Task, Event.

Alle Objekte werden per SFDMU über das Trace-Feld `<Objekt>CrossOrgTraceID__c` (Quell-Id, External ID) geladen. Verknüpfungen laufen über die Trace-IDs der Parents, Besitzer und Ersteller über `User.Legacy_User_id__c`.

## 1. Gesamtstand

| Objekt | Quelle | Im Ziel | Offen | Hauptgrund für Offenes |
|---|---|---|---|---|
| Opportunity | 8.153 | 8.153 | 0 | 2 der 4 neuen ohne Account (Delta) |
| OpportunityLineItem | 3.079 | 3.079 | 0 | |
| Quote | 1.461 | 1.461 | 0 | 126 Adressfehler wurden mit korrigierten Adressen nachgeladen |
| QuoteLineItem | 3.369 | 3.364 | 5 | Quote und Items erst nach dem Lauf entstanden (Delta) |
| Order | 147.013 | 147.011 | 2 | Account erst nach dem Lauf entstanden (Delta) |
| OrderItem | 546.794 | 534.419 | 12.375 | 11.911 negative Menge, 464 Delta |
| Asset | 45.141 | 35.085 | 10.056 | Validierungsregel "Name max. 40 Zeichen" |
| Case | 41.105 | 32.427 | 8.688 | restricted Picklists (6.120), Regel Asset/Account (2.568) |
| Task | 48.549 aktiv | 47.965 | 584 | 3 wiederkehrend, 6 neu, 575 vom Ziel archiviert |
| Event | 43 aktiv | 42 | 1 | archiviert |

Zusätzlich fehlen **archivierte Aktivitäten** (nicht migriert): 78.428 Tasks und 112 Events (siehe Abschnitt 4).

Die Zahlen zu OrderItem stammen aus den Prüfungen nach den Chunk-Läufen. Die Quelle wächst weiter, spätere Abgleiche weichen ab.

## 2. Fehler je Objekt

### Opportunity
- Keine Fehler in Insert und Update (8.149 Inserts im ersten Lauf, 4 neue im zweiten).
- `SyncedQuoteId` muss in einem **zweiten Lauf** gesetzt werden, weil die Quotes erst danach existieren. Ergebnis: 894 von 895 gesetzt, eine Opportunity hat ihre Quote erst nach dem Lauf bekommen.
- Das Setzen von `SyncedQuoteId` ersetzt die OLIs nicht, weil die QLIs bereits an die OLIs gebunden sind (an einem Datensatz getestet).
- 2 der 4 neuen Opportunities haben keinen Account (Account erst nach dem Lauf entstanden).

### OpportunityLineItem
- Keine Fehler (3.079 von 3.079).
- `CreatedDate` und `CreatedById` sind bei OLI weder in Quelle noch im Ziel schreibbar. Ersteller ist der Import-User, Datum ist das Ladedatum.
- Vorab: Alle benötigten Preislisteneinträge, Produkte und Preislisten mussten aktiv sein (95 Preislisteneinträge, 50 Produkte, 1 Preisliste wurden aktiviert).

### Quote
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `FIELD_INTEGRITY_EXCEPTION`: Bundesland ohne Land / Land oder Bundesland ungültig (Billing und Shipping) | 126 Quotes | Das Ziel prüft Land und Bundesland gegen Picklists. In der Quelle fehlt das Land (102) oder der Wert ist ungültig (z. B. "Overland Park" oder eine PLZ im Länderfeld) | Zach hat die Korrekturen in `JOM-125_Quote_Address_Fixes_JK_US.xlsx` geliefert (126 Zeilen). Die Quotes wurden ohne Adresse angelegt und die Adressen per Bulk-Upsert nachgeschrieben. In der Quelle wurde nichts geändert, damit die Steuerlogik nicht neu feuert |
| `FIELD_INTEGRITY_EXCEPTION`: Bundesland ungültig bei 3 Mexiko-Quotes ("Juarez" → Chihuahua) | 3 | Das Textfeld erwartet bei Mexiko einen internen Wert (`CHI`), `CH` wird abgelehnt | Über die Codefelder `BillingStateCode` und `BillingCountryCode` geschrieben |
| `Can't change quote owner. Enable quotes without parent opportunities` | 1.461 beim Besitzer-Update | Besitzer einer bestehenden Quote lässt sich nur ändern, wenn die Einstellung `enableQuotesWithoutOppEnabled` an ist | Einstellung per Metadaten-Deploy kurz auf `true`, Besitzer per Bulk-Update gesetzt, danach wieder auf `false` (geprüft) |

- `OwnerId` kann bei Quote nicht per SFDMU geladen werden (siehe Abschnitt 3, polymorphes `OwnerId`). Die Besitzer wurden nachträglich per Bulk-Update gesetzt.
- 1 Quote verweist auf einen Contact, der im Ziel fehlt (Contact `003VQ00001GjMttYAF`), sie wurde ohne Contact angelegt.

### QuoteLineItem
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `REQUIRED_FIELD_MISSING: QuoteId` | 3 | Die Quote 00001600 wurde erst nach dem Lauf in der Quelle angelegt | Delta, Schlusslauf |
| Fehlt im Ziel ohne Fehlermeldung | 2 | Neue Items seit dem Lauf | Delta |

- Vorab: 2 Preislisteneinträge und 1 Produkt mussten aktiviert werden.

### Order
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `REQUIRED_FIELD_MISSING: Select an account` | 2 | Account erst nach dem Lauf in der Quelle entstanden | Delta |
| `DUPLICATE_VALUE` im Update-Pass | 2 | Folgefehler der zwei gescheiterten Inserts, kein echtes Duplikat | keine |

- Alle US-Status (Completed, Canceled, Pending, Scheduled, Shipped, Installed) werden laut `ValueMapping.csv` auf `Draft` gemappt, weil `Order.Status` im Ziel ein restricted Picklist ist.
- Besitzer wurden nachträglich per Bulk-Update gesetzt (147.011), dabei gab es 1.400 Sperrfehler (`UNABLE_TO_LOCK_ROW`), die wiederholt wurden.

### OrderItem (Chunks 2020 bis 2026)
| Jahr | Geladen | Fehlend | davon negative Menge | Läufe |
|---|---|---|---|---|
| 2020 | 61.985 von 64.480 | 2.495 | 2.495 | 2 |
| 2021 | 59.804 von 61.868 | 2.064 | 2.064 | 3 (ein Lauf brach ab) |
| 2022 | 76.567 von 78.310 | 1.743 | 1.743 | 2 |
| 2023 | 85.677 von 87.248 | 1.571 | 1.571 | 3 |
| 2024 | 86.706 von 88.011 | 1.305 | 1.305 | 4 |
| 2025 | 90.486 von 92.082 | 1.596 | 1.596 | 3 |
| 2026 | 73.194 von 74.795 | 1.601 | 1.137, Rest 464 Delta | 2 |

| Fehler | Anzahl (Beispiel) | Ursache | Lösung |
|---|---|---|---|
| `FIELD_INTEGRITY_EXCEPTION: Can't save order products with negative quantities` | 11.911 gesamt | `enableNegativeQuantity` ist in der US-Org **true**, in der FullCopy **false** | Einstellung im Ziel angleichen (Entscheidung beim Team, siehe Abschnitt 5), danach die Chunks erneut laufen lassen |
| `UNABLE_TO_LOCK_ROW` im Insert-Pass | z. B. 3.862 (2020), 20.358 (2021), 7.670 (2025) | Mehrere parallele Batches sperren dieselbe Order | Chunk erneut laufen lassen, bis nur noch die negativen Mengen fehlen (2 bis 4 Läufe je Chunk) |
| `UNABLE_TO_LOCK_ROW` im Update-Pass | 200 bis 12.277 je Lauf | wie oben | unkritisch, der Update-Pass trägt nur Verweise nach, die beim Insert schon stimmen |
| `Polling time out` (2021, zweiter Lauf) | 1 Lauf | Bulk-Abfrage der Orders im Ziel dauerte zu lange | Lauf wiederholt, es wurde nichts geschrieben |
| `Missing value for required field(s): Order` | 367 (2026) | 52 Orders nach dem Order-Lauf entstanden | Delta |
| `Required fields are missing: [PricebookEntryId, Product2Id]` | 93 (2026) | 22 Standard-Preislisteneinträge und neue Produkte (5. bis 11.11. angelegt) fehlen im Ziel | Delta |
| `Order Products must have a Price Book Entry that belongs to the Price Book` | 4 (2026) | passt zu den neuen Preislisteneinträgen | Delta |
| `DUPLICATE_VALUE` im Update-Pass | 2 (2020) | Folge gescheiterter Inserts | keine |

- Vorab aktiviert: 31 Preislisteneinträge und 1.178 Produkte (inaktiv im Ziel). **Sie sind noch aktiv.**
- Der Fehler "Order fehlt" aus dem Lauf vom 5.11. trat nicht mehr auf. Vermutlich hing er an den damaligen Orders im Ziel.
- Chunk `110_OrderItem` (alle Jahre) darf nicht gestartet werden, er ist zu groß (Bulk-Limit 150 MB).

### Asset
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `FIELD_CUSTOM_VALIDATION_EXCEPTION`: Asset Name max. 40 Zeichen (SAP-Grenze) | 10.056 | Regel `Asset_Name_max_40_Chars` (`LEN(Name) > 40`) im Ziel, die US-Namen sind länger | **Offen.** Regel bleibt aktiv, Entscheidung beim Team. Alternativen: Namen kürzen oder Regel temporär deaktivieren |
| `SC_AssetTrigger: Too many future calls: 51` im Update-Pass | 35.085 | Trigger im Ziel ruft pro Datensatz eine Future-Methode | Unkritisch: In der Quelle hat kein Asset eine `ParentId`, der Update-Pass hätte nichts nachzutragen |

- `CreatedDate` und `CreatedById` sind bei Asset nicht schreibbar.
- Nicht übernommen (im Ziel nicht schreibbar): `RootAssetId`, `AssetLevel`, `ProductCode`, `ProductFamily`, `StockKeepingUnit`, `ProductDescription`, `Address` (stattdessen Street, City, State, PostalCode, Country).

### Case
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` bei 8 Feldern | 6.120 Cases | Im Ziel fehlen 30 Picklist-Werte | **Offen**, Entscheidung beim Team (Werte im Ziel ergänzen, mappen oder leer laden) |
| `FIELD_CUSTOM_VALIDATION_EXCEPTION`: Asset muss zum Account passen | 2.568 Cases | Regel im Ziel, in der Quelle gilt sie nicht überall | **Offen**, Option: Cases ohne `AssetId` laden |

Fehlende Picklist-Werte (Details in `case_picklist_gaps.json`):

| Feld | Cases | Fehlende Werte | Beispiele |
|---|---|---|---|
| `Sunlync_Case_Reason__c` | 2.743 | 13 | "T-Server – Timer Issue", "Back Office – Configuration" |
| `Service_Case_Escalation__c` | 1.992 | 1 | "Customer Service" |
| `SL_T__c` | 1.094 | 3 | "Support", "Billing", "Sales" |
| `Service_Case_Type__c` | 806 | 1 | "Certified Tech. Support" |
| `SunLync_Software_Build__c` | 56 | 7 | "2" bis "5" |
| `Service_Resolution__c` | 18 | 1 | "Ordered Placed" |
| `SunLync_Software_Version__c` | 4 | 2 | "V7.X.X.X", "V8.X.X.X" |
| `Error_Code__c` | 3 | 2 | "E104/#420", "E170" |

Weiteres zu Case:
- **Record Types** passen nicht zusammen: Quelle hat 5 (Zendesk Ticket Sync, Accounting, Sunlync, JK America, Service), das Ziel andere. Zuordnung: Sunlync → Support SunLync, alle anderen → Support General (`130_Case/ValueMapping.csv`). Das greift nur über die Query-Spalte `RecordType.DeveloperName`, nicht über `RecordTypeId`.
- **Queues:** 12.782 Cases gehören einer Queue. Im Ziel gab es nur SunLync Level 1 und Support Level 1. Es wurden **7 Queues angelegt** (Customer Support, Technician, Advanced Service Queue, SunLync Level 2 und 3, Enhancement Request, Implementation), ohne Mitglieder. Der Besitzer wurde nachträglich über den Entwicklernamen gesetzt (11.508 Cases in Queues, 20.919 bei Usern).
- Nicht übernommen: `OwnerId` (kommt nachträglich), `LastModifiedById/Date`, `SourceId`, `BusinessHoursId`, `CS_Queue_Assignment__c`, `Zendesk_Support_Ticket_Requester_As_Lead__c`.
- Fehlende Parents: Asset bei 1.809 Cases (Assets wegen Namenregel nicht im Ziel), Contact 9, Account 3.
- 8.688 Cases sind noch nicht im Ziel. Nach der Klärung reicht ein weiterer Lauf von `130_Case`.

### Task
| Fehler | Anzahl | Ursache | Lösung |
|---|---|---|---|
| `Apex Task trigger cannot handle batch operations on recurring tasks` | 3 | Wiederkehrende Tasks lehnt ein Trigger im Stapel ab | Einzeln nachladen (offen) |
| `DUPLICATE_VALUE` im ersten Lauf | 3 | Folgefehler | keine |
| Fehlt, weil nach dem Lauf entstanden | 6 | Delta | Schlusslauf |
| **Vom Ziel archiviert** | 575 | Alte Tasks werden nach dem Insert vom Salesforce-Archiv übernommen und sind danach nicht mehr änderbar | siehe Abschnitt 4 |

- `WhatId` und `WhoId` wurden **nicht per SFDMU** geladen (polymorphe Felder), sondern per Bulk-Update über die Trace-IDs gesetzt: 39.526 Tasks, nach Wiederholung der 3.600 Sperrfehler vollständig geprüft.
- Nicht setzbar: 4.580 Tasks mit Lead als `WhoId` (Leads nicht migriert), 598 mit `ListEmail`, 5 mit `Campaign` als `WhatId`, 4.646 mit einem Case, der im Ziel noch fehlt, 28 mit einem Asset, das fehlt, 15 mit einem fehlenden Contact.
- Besitzer: alle 47.965 per Bulk-Update gesetzt (2.400 Sperrfehler wiederholt).
- Im Quell-Objekt gibt es 22 Felder aus RingCentral/RingCX (`rcsfl__*`, `ringcx_sf__*`), die im Ziel nicht existieren. Diese Anrufdaten wandern nicht mit.

### Event
- Keine Fehler beim Laden (43 von 43). Eines davon wurde danach archiviert (42 sichtbar).
- `WhatId`/`WhoId` per Bulk-Update (5 Datensätze).
- 38 Events gehören einem Kalender statt einem User. Im Ziel gibt es keine passenden Kalender, **37 bleiben beim Import-User** (1 archiviert).

## 3. Technische Besonderheiten (übergreifend)

| Thema | Ursache | Umgang |
|---|---|---|
| **Polymorphes `OwnerId`** bei Quote, Order, Case, Task, Event | SFDMU erzeugt `Owner.Legacy_User_id__c`, was Salesforce bei Gruppen/Queues/Kalendern ablehnt. Die Abfrage bricht ab (`No such column 'Legacy_User_id__c' on entity 'Name'`) | `OwnerId` aus der Config nehmen, Besitzer danach per Bulk-Update setzen (Zuordnung über `Legacy_User_id__c`). Opportunity und Asset haben nur User als Besitzer, dort geht es per SFDMU |
| **Polymorphes `WhatId`/`WhoId`** bei Task und Event | gleiche Ursache | Felder aus der Query nehmen, danach per Bulk-Update setzen |
| **`UNABLE_TO_LOCK_ROW`** bei großen Updates und Inserts | parallele Bulk-Batches sperren dieselbe Parent-Order oder denselben Account | Wiederholen. Bei Bulk-Updates für Besitzer 1.000 bis 3.600 Fälle je Lauf, immer erfolgreich beim Wiederholen |
| **Audit-Felder** | `CreatedDate`/`CreatedById` nur beim Insert und nur mit "Set Audit Fields upon Record Creation". Bei OLI und Asset gar nicht schreibbar | in den Configs gesetzt wo möglich, `LastModifiedDate` bewusst nicht |
| **Fallback-User** | Sechs Quell-User ohne Ziel-User | `core:RecordsTransform` in den Configs (Contact, Case, Task, Event), Ziel-User `0059M000011wJ9HQAU` ("US Data Migration", `Legacy_User_id__c` = `005Dn000008FyWSIA0`) |
| **Delta** | In der Quell-Org wird weiter gearbeitet. Neue Accounts, Opportunities, Quotes, Orders, Items, Produkte, Preislisteneinträge und Tasks seit dem 12.11. fehlen im Ziel | Schlusslauf (Abschnitt 5) |
| **Excel-Datei Adressen** | Datei von Zach: `JOM-125_Quote_Address_Fixes_JK_US.xlsx` | liegt in `docs/` |

## 4. Archivierte Aktivitäten (wichtig)

Salesforce archiviert abgeschlossene Tasks und Events nach etwa einem Jahr. Sie sind in normalen Abfragen nicht sichtbar, auch nicht in SFDMU.

| | Quelle | Ziel |
|---|---|---|
| Tasks archiviert | 78.428 (2023: 13.549, 2024: 36.913, 2025: 27.931, 2026: 35) | 1.357 (davon 575 von uns) |
| Events archiviert | 112 | 17 |

- Die Migration hat nur aktive Aktivitäten geladen. **Zwei Drittel der Task-Historie fehlen.**
- Neu eingefügte alte Tasks werden vom Ziel bald wieder archiviert und sind dann schreibgeschützt. `WhatId`, `WhoId` und Besitzer müssten deshalb **direkt beim Insert** stehen. Das geht mit SFDMU nicht (polymorph), also nur über einen eigenen Bulk-Insert.
- Die 575 Tasks, die das Ziel selbst archiviert hat, haben wahrscheinlich keine Verknüpfung und keinen Besitzer aus den Nachträgen (noch nicht geprüft).

## 5. Offene Entscheidungen und Aufgaben

1. **Negative Mengen:** `enableNegativeQuantity` im Ziel angleichen? Danach OrderItem-Chunks 2020 bis 2026 erneut laufen lassen (11.911 Positionen). Dasselbe gilt für die echte EU-Org.
2. **Asset-Name > 40 Zeichen:** Namen kürzen oder Regel anpassen (10.056 Assets, dazu 1.809 Cases mit Asset).
3. **Case-Picklists:** 30 Werte in 8 Feldern ergänzen, mappen oder leer lassen (6.120 Cases).
4. **Case-Regel Asset/Account:** 2.568 Cases ohne `AssetId` laden oder Regel prüfen.
5. **Archivierte Aktivitäten:** nachladen (eigener Lauf, Verknüpfungen beim Insert) oder verzichten.
6. **Leads:** nicht migriert. 4.580 Tasks hängen an Leads.
7. **RingCentral-Felder:** Anrufdaten im Ziel ohne Felder.
8. **Schlusslauf (Delta):** neue Datensätze aller Objekte seit dem 12.11., dazu die 3 wiederkehrenden Tasks und die Quote 00001600 mit ihren Items.
9. **Aufräumen in der FullCopy:**
   - Die für OLI, QLI und OrderItem **aktivierten Preislisteneinträge (1.153 + 31 + 95 + 2) und Produkte (1.178 + 50 + 1)** deaktivieren, sobald alle Läufe durch sind.
   - Temporäres Permission Set "Tracing" auf CDEV5 und die temporären Bypass-Permission-Sets auf der FullCopy entfernen.
   - Die 7 neuen Queues behalten oder entfernen.
10. **Config-Änderungen** (Opportunity, Quote, QLI, Order, OrderItem-Chunks, Asset, Case, Task, Event) sind noch **nicht committet**.

## 6. Änderungen an der FullCopy während des Re-Imports

| Änderung | Stand |
|---|---|
| Einstellung `enableQuotesWithoutOppEnabled` kurz auf `true` | zurück auf `false` (geprüft) |
| 7 Queues angelegt | bestehen |
| Preislisten, Preislisteneinträge, Produkte aktiviert | **noch aktiv** |
| Besitzer von Quote, Order, Case, Task, Event per Bulk-Update | gesetzt |
| `WhatId`/`WhoId` bei Task/Event per Bulk-Update | gesetzt |
| Adressen von 126 Quotes per Bulk-Upsert | gesetzt |

## 7. Ergebnisdateien

Die Run-Ergebnisse (Meta, Log, Berichte, Ergebnisdateien) der Läufe seit dem 12.11. liegen im Ordner `transfer/Run_Results/<Ordner>/<Lauf-ID>/`. Je Lauf:
- `meta.json`: Zeitraum, Modus, Zähler
- `log.txt`: Konsolenausgabe
- `reports/MissingParentRecordsReport.csv`: fehlende Parents
- `target/<Objekt>_insert_target.csv` und `<Objekt>_update_target.csv`: ein Datensatz je Zeile, Spalte `Errors` mit der Fehlermeldung (`#N/A` heißt kein Fehler)

Weitere Dateien im Ordner `transfer/Zusatzdateien/`:
- `JOM-125_Quote_Address_Fixes_JK_US.xlsx`: Adresskorrekturen von Zach für die 126 Quotes
- `Quotes_Adressfehler_126.csv` und `.xlsx`: die 126 gescheiterten Quotes mit Quell- und Account-Adresse
- `case_picklist_gaps.json`: fehlende Picklist-Werte der Case-Felder mit Anzahl
- `owner_case.csv`, `owner_task.csv`, `owner_event.csv`: die per Bulk-Update gesetzten Besitzer (Ziel-Id des Datensatzes, Ziel-Id des Besitzers)

Nicht als Datei enthalten: die Besitzer-Zuordnung für Quote und Order sowie die `WhatId`/`WhoId`-Zuordnung für Task und Event. Sie sind aus den Trace-IDs jederzeit neu ableitbar (Quell-Besitzer → `Legacy_User_id__c` am Ziel-User, Parents → Trace-ID am Ziel-Datensatz).

Hinweis: Der Ordner `transfer/` ist nicht in `.gitignore` und etwa 750 MB groß. Nicht committen.
