# US->EU Feldabgleich (CDEV5) — Klärungsliste

Basis: `00 Dokumente/JK Mappings/JK_SAP_Salesforce_Field_Guide_v5_vFinal.xlsx` (Kategorie "US org
only - no matching EU field found") abgeglichen gegen den aktuellen Feld-Describe von **CDEV5**
(`sf sobject describe --target-org CDEV5`, Stand 2026-09-29). Vollständige Feldlisten stehen in
[`00 Dokumente/JK Mappings/JK_US_Fields_Missing_in_CDEV5_v1.md`](../../00%20Dokumente/JK%20Mappings/JK_US_Fields_Missing_in_CDEV5_v1.md).

Ziel: offene Punkte klären, bevor irgendein Feld in CDEV5 (oder später EU Prod) angelegt wird.
Es wurde bewusst noch nichts angelegt.

| # | Objekt | Betroffene Felder | Was steht drin | Problem / Widerspruch | Zu klärende Frage | Vorschlag Owner |
|---|---|---|---|---|---|---|
| 1 | Contact | Alle 21 "US only"-Felder laut Field Guide (u. a. `JK_VIP__c`, `JK_Equipment__c`, `JK_Light__c`, `JK_Parts__c`, `SunLync__c`, `SAP_Contact_Import__c`) | Der Field Guide vergleicht US-Org gegen EU-Prod (`eu-prod`) und markiert diese 21 Felder als "nur in US vorhanden". Keines davon existiert aktuell in CDEV5. | Nicht klar, ob CDEV5 hier einfach hinter `eu-prod` zurückliegt (Sandbox veraltet/nicht refresht) oder ob diese Felder in `eu-prod` ebenfalls fehlen und der Field Guide korrekt "US only" meint. Bei 0 von 21 vorhandenen Feldern ist ein reiner Zufall unwahrscheinlich. | Ist CDEV5 aktuell (Refresh-Datum) gegenüber `eu-prod`? Falls ja: sind diese 21 Felder EU-seitig bewusst nicht vorhanden (Scope-Entscheidung) oder eine Lücke, die geschlossen werden muss? | Solution Design / Customer |
| 2 | Account | 9 Felder, überwiegend AvaTax-Managed-Package (`AVA_MAPPER__*`, `AVA_SFCLOUD__*`) | 84 von 93 "US only"-Feldern existieren bereits in CDEV5, nur diese 9 fehlen. | Die fehlenden Felder gehören fast alle zu AvaTax (Steuer-Berechnung) — vermutlich ist das Managed Package in CDEV5 nicht (vollständig) installiert. | Ist AvaTax für EU/CDEV5 überhaupt im Scope, oder ist das bewusst eine US-only-Integration? | Solution Design / Customer |
| 3 | Opportunity | 29 von 30 "US only"-Feldern, überwiegend AvaTax plus JK-Custom-Felder (`Key_Account__c`, `Budget_Confirmed__c`, `Client_PO__c`, `Product_Line__c` u. a.) | Nur 1 von 30 Feldern existiert bereits in CDEV5. | Gleiches Muster wie Contact — entweder Sandbox-Rückstand oder bewusste EU-Lücke, aber deutlich mehr betroffene Felder als bei Account. | Gleiche Grundfrage wie #1, zusätzlich: welche der JK-Custom-Felder (nicht AvaTax) werden für den EU-Vertriebsprozess überhaupt benötigt? | Solution Design / Customer |
| 4 | Alle drei | — | Der Field Guide vergleicht ausschließlich US vs. `eu-prod`. Für den SFDMU-Feasibility-Test wurde stattdessen gegen `CDEV5` migriert. | Eine reine CDEV5-Lücke sagt nichts darüber aus, ob eu-prod (Ziel-Prod-Org nach Merge) dieselbe Lücke hat. | Soll der Feldabgleich zusätzlich direkt gegen `eu-prod` laufen, um Sandbox-Drift von echter Feldlücke zu trennen? | Tech Lead |
| 5 | Order | `Name` | Field Guide markiert `Order.Name` als "Mappable - exact API name match". Ein direktes `SELECT Name FROM Order` gegen CDEV5 schlägt mit `INVALID_FIELD` fehl — das Standardobjekt Order hat kein `Name`-Feld (nutzt `OrderNumber`/`OrderReferenceNumber`). | Fehler im Field Guide selbst, nicht in CDEV5. Wurde in `export.json` bereits entfernt, damit die SFDMU-Simulation nicht crasht. | Soll der Field Guide korrigiert werden (Zeile entfernen/durch `OrderNumber` ersetzen)? Sonst wiederholt sich der Fehler bei jedem, der den Guide für andere Zwecke nutzt. | Tech Lead |
| 6 | Alle mit User-Lookup (Account, Contact, Opportunity, Quote, Order, Asset, Case, Task, Event, ContentVersion) | `OwnerId`, `ActivatedById`, `CompanyAuthorizedById`, `CustomerAuthorizedById`, `AssetProvidedById`, `AssetServicedById` | Field Guide markiert diese User-Lookups als exact-match-mappable, weil das API-Feld auf beiden Seiten existiert. Das sagt aber nichts über die referenzierten User-*Records* aus. | Users unterscheiden sich zwischen `us-prod` und `CDEV5` (unterschiedliche IDs, teils unterschiedliche Personen/Lizenzen). Besonders bei historischen Records ist der ursprüngliche US-Owner in CDEV5 oft gar nicht vorhanden. | Welcher User soll für migrierte/historische Records als Owner gesetzt werden, wenn der ursprüngliche US-Owner in der Zielorg fehlt? Gibt es einen definierten "Default-Owner" (z. B. ein Integrations-/Migrations-User) oder soll nach E-Mail/Username gemappt werden, wo möglich? | Solution Design / Customer |
| 6a | **CONFIRMED durch Live-Lauf (2026-09-29):** Account, Contact, Opportunity, Order, Asset, Case, Event | `OwnerId` | Der erweiterte Live-Lauf hat empirisch bestätigt, was Punkt 6 vermutet hat: **fast jeder Insert ist mit `Owner ID: owner cannot be blank` bzw. `INVALID_CROSS_REFERENCE_KEY:Owner ID: owner cannot be blank:OwnerId` fehlgeschlagen**, weil `User` nicht in `export.json` enthalten ist und SFDMU `OwnerId` daher nicht auflösen kann. | Trotz "Command succeeded" / Exit 0 wurde **fast nichts neu angelegt** — einzige Ausnahme: `Product2` (10 von 10 erfolgreich, kein `OwnerId`-Feld). Alle Kind-Objekte (`OpportunityLineItem`, `QuoteLineItem`, `OrderItem`) sind kaskadierend mitgefallen, weil ihr Parent (`Opportunity`/`Quote`/`Order`) nie entstanden ist. | Punkt 6 ist damit kein theoretisches Risiko mehr, sondern der **Blocker Nr. 1** für jeden weiteren Live-Lauf. Ohne User-Mapping-Entscheidung bringt ein erneuter Lauf voraussichtlich dasselbe Ergebnis. | Solution Design / Customer |
| 7 | OpportunityLineItem, QuoteLineItem, OrderItem, Asset, Case, Task, Event, ContentVersion | siehe Vorschlagsspalte | Für diese 8 Objekte gibt es aktuell keinen geprüften Match-Key — Config läuft bewusst auf `Insert` statt `Upsert`. | Jeder erneute Lauf gegen dasselbe Ziel erzeugt Duplikate, solange kein `externalId` gesetzt ist. | Sind folgende Kandidaten-Keys plausibel? OppLineItem: `OpportunityId;Product2Id`; QuoteLineItem: `QuoteId;Product2Id`; OrderItem: `OrderId;Product2Id`; Asset: `SerialNumber` (oft leer — Risiko!); Case: `CaseNumber` (Autonumber, nicht im Field Guide gelistet, aber standardmäßig eindeutig); Task/Event/ContentVersion: kein belastbarer Key gefunden, evtl. bewusst Insert-only lassen. | Solution Design / Customer |
| 8 | Account, Opportunity | `Search_Term__c` → `SalesC_SearchTerm__c` (Account, 100% Label-Match); `Loss_Reason__c` → `Lost_Reason__c` (Opportunity, 91% Label-Match) | Field Guide kategorisiert diese als "Probably mappable (label similarity …%) - please verify" — Feldlabel ist (fast) identisch, aber die **API-Namen unterscheiden sich**. Reines 1:1-Feld-Mapping auf denselben API-Namen (wie bei den "exact match"-Feldern) reicht hier nicht. | Aktuell in `export.json` nirgends berücksichtigt (weder als Feld noch als Umbenennung) — SFDMU migriert per Query/Feldname, kann Umbenennungen nicht automatisch erkennen. | Sollen diese (und die übrigen "Probably mappable"-Kandidaten) explizit als Feld-zu-Feld-Mapping bestätigt werden, damit sie in die Query mit Alias/Transformation aufgenommen werden können? | Solution Design / Customer |
| 9 | Opportunity | `Loss_Reason__c` (Picklist, 9 Werte: `Not Responsive`, `Project Canceled`, `Not Good Timing`, `Price`, `Lead Time`, `Limited Offer`, `Competition`, `Financing`, `Other`) | Im Tab *Picklist Mapping* sind diese 9 US-Werte als "US org only field - no matching EU field found" markiert — **keine Zielwerte definiert**, obwohl Tab *Opportunity Mapping* das Feld als "probably mappable" auf `Lost_Reason__c` vorschlägt (#8). Die im Guide enthaltenen EXAMPLE-Zeilen (`Won`/`Lost` → `Closed Won`/`Closed Lost`, `Active` → `active`) zeigen nur das Muster, wie ein Picklist-Value-Merge aussehen soll — nicht die echte Zuordnung für dieses Feld. | Widerspruch zwischen den beiden Tabs: Feld gilt als mappbar, aber die zugehörigen Picklist-Werte sind es (laut Doc) nicht. Ohne Werte-Mapping würde ein SFDMU-Lauf entweder leere/ungültige Picklist-Werte schreiben oder das Feld müsste ganz ausgelassen werden. | Welche der 9 US-Werte werden auf welchen `Lost_Reason__c`-Wert in CDEV5/EU gemappt (n:1 möglich, z. B. `Price` + `Financing` → ein gemeinsamer EU-Wert)? Gilt das gleiche Muster für andere mehrwertige Picklists aus der Liste (z. B. `Contact Type`, `SunLync Account Type`)? | Solution Design / Customer |

| 10 | PricebookEntry | `Pricebook2Id` | Live-Lauf: **alle 37 PricebookEntry-Inserts fehlgeschlagen** mit `Required fields are missing: [Pricebook2Id]`. Ursache: der `WHERE CreatedDate = LAST_N_DAYS:7`-Filter lässt `Pricebook2` mit 0 Treffern zurück (Standard-/Legacy-Preisbücher sind älter als 7 Tage), also kann SFDMU `Pricebook2Id` nicht auf einen migrierten Datensatz mappen. | Der Zeitfilter, der für die Feasibility-Test-Größe sinnvoll ist, sabotiert hier die Fremdschlüssel-Auflösung für ein Objekt, das naturgemäß selten neu angelegt wird. | Soll `Pricebook2` (und ggf. andere Referenz-/Stammdaten-Objekte wie `Product2`-Familien) ohne `CreatedDate`-Filter migriert werden, damit Lookups wie `Pricebook2Id` auflösbar bleiben? | Tech Lead |

**Status 2026-09-29 (nach Simulation):** Punkt 10 ist technisch behoben — `Pricebook2` läuft in
`export.json` jetzt ohne `CreatedDate`-Filter. Eine erneute Simulation zeigt für `PricebookEntry`
keine Fehler mehr.

**Status 2026-09-29 (Workaround-Versuch 1 für #6/#6a, verworfen):** Erster Versuch war ein
`dataRetrievedAddons`-Eintrag (`core:RecordsTransform`), der `OwnerId` & Co. fest auf den
CDEV5-User setzt. Lief in der Simulation fehlerfrei, **im echten Live-Lauf aber weiterhin
`owner cannot be blank`** — SFDMU bereinigt Lookup-Felder auf nicht migrierte Objekte (`User`)
in einem eigenen Nachbearbeitungsschritt, der den Add-On-Wert wieder überschreibt. Simulation
allein reicht hier nicht als Nachweis, da SFDMU im Simulationsmodus gar keine echten Insert-Calls
gegen die Ziel-API sendet, also serverseitige Validierungsfehler wie diesen nicht aufdecken kann.

**Status 2026-09-29 (Workaround-Versuch 2 für #6/#6a, funktioniert):** `OwnerId` und die
übrigen User-Lookups (`ActivatedById`, `CompanyAuthorizedById`, `CustomerAuthorizedById`,
`AssetProvidedById`, `AssetServicedById`) wurden komplett aus den Queries entfernt statt
versucht, sie zu befüllen. Per direktem `sf data create record`-Test gegen CDEV5 bestätigt:
ohne explizites `OwnerId` im Insert setzt Salesforce automatisch den ausführenden User
(Jan Drommershausen) als Owner. **Auch das ist nur ein technischer Workaround für den
Feasibility-Test, nicht die inhaltliche Antwort auf Punkt 6/6a** — in einer echten Migration
würde jeder migrierte Datensatz auf eine einzelne Person laufen, unabhängig vom tatsächlichen
US-Owner. Die Frage nach dem echten Default-Owner (oder einem Username-Mapping für User, die
auf beiden Seiten existieren) bleibt offen.

| 11 | Account (und ggf. weitere Objekte mit Entitlement-Prozessen) | — (kein Feld, sondern eine Automation) | Beim Anlegen eines Test-Accounts in CDEV5 (`sf data create record`, außerhalb von SFDMU) hat eine Automation automatisch einen verknüpften `Entitlement`-Record erzeugt. Der Test-Account ließ sich danach nicht mehr löschen (`DELETE_FAILED`: "associated with the following entitlements"). | CDEV5 hat aktive Business-Logik (Flow/Trigger/Prozess), die bei Account-Anlage mitläuft — nicht Teil des Field Guides oder der SFDMU-Config, aber relevant für jeden Test- und Migrationslauf: pro migriertem Account entsteht potenziell 1 zusätzlicher Entitlement-Record, den wir nicht mitgeplant haben. | Ist diese Entitlement-Automation auch in `us-prod`/`eu-prod` aktiv (dann evtl. schon im Field Guide/Scope) oder CDEV5-spezifisch (Sandbox-Konfiguration)? Sollen bei künftigen SFDMU-Testläufen erzeugte Entitlements aktiv aufgeräumt/berücksichtigt werden, oder ist das für den Feasibility-Test irrelevant? | Tech Lead |

## Ergebnis des ersten Live-Laufs (2026-09-29, erweiterte Config)

Der Lauf endete mit **Exit 0 / "Command succeeded"**, aber das ist irreführend — SFDMU meldet
den Job als erfolgreich, sobald er ohne Absturz durchläuft, nicht wenn die Records tatsächlich
geschrieben wurden. Tatsächliches Ergebnis pro Objekt (aus den `target/*_insert_target.csv`-
Fehlerspalten):

| Objekt | Versucht | Erfolgreich | Fehlerursache |
|---|---|---|---|
| Product2 | 10 | **10** | — |
| Account | 40 | 0 | Owner ID: owner cannot be blank |
| Contact | 24 (+ 31 Update) | 0 | Owner ID: owner cannot be blank |
| Opportunity | 37 | 0 | Owner ID: owner cannot be blank |
| Quote | 4 | 0 | Owner ID: owner cannot be blank |
| PricebookEntry | 37 | 0 | Required fields are missing: [Pricebook2Id] (siehe #10) |
| OpportunityLineItem | 5 | 0 | Required fields are missing: [OpportunityId] (kaskadiert von Opportunity) |
| QuoteLineItem | 7 | 0 | Required fields are missing: [QuoteId, PricebookEntryId, Product2Id] (kaskadiert) |
| Order | 685 | 0 | Owner ID: owner cannot be blank |
| OrderItem | 5136 | 0 | Required fields are missing: [OrderId] (kaskadiert von Order) |
| Asset | 94 | 0 | Owner ID: owner cannot be blank |
| Case | 405 | 0 | Owner ID: owner cannot be blank |
| Task | 1189 | 0 (vermutlich, gleiches Muster — WhoId/WhatId) | siehe Punkt 6/6a |
| Event | 3 | 0 | Assigned To ID: owner cannot be blank |

**Praktisch nur `Product2` (10 Records) wurde real hinzugefügt.** Alles andere ist an Punkt
6a (User-Mapping) oder Punkt 10 (CreatedDate-Filter auf Referenzdaten) gescheitert.

## Datenqualität & Validierungsfehler (aus dem zweiten Live-Lauf, 2026-09-29)

Nach dem Owner-Fix (Workaround-Versuch 2) und dem Pricebook2-Fix lief der Großteil der Objekte
fehlerfrei durch (Opportunity, Case, Task, Event: 100 % erfolgreich). Die verbleibenden Fehler
zerfallen in klar unterscheidbare **Kategorien** — keine davon hängt mehr mit Owner/Parent
zusammen, jede braucht eine eigene inhaltliche Entscheidung:

| # | Kategorie | Objekt | Betroffene Felder | Was steht drin | Problem / Widerspruch | Zu klärende Frage | Vorschlag Owner |
|---|---|---|---|---|---|---|---|
| 12 | Picklist-Mapping | Order | `Status` | Live-Lauf: alle 685 Order-Inserts fehlgeschlagen mit `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` für die Werte `Completed`, `Pending`, `Shipped`, `Scheduled`. | `Order.Status` ist in CDEV5 ein **restricted Picklist** — diese US-Werte sind dort nicht als gültige Picklist-Werte definiert. Gleiches Muster wie Punkt 9 (Opportunity Loss Reason), nur bei einem Pflichtfeld statt einem optionalen. | Sollen die fehlenden Picklist-Werte in CDEV5/EU ergänzt werden, oder auf bestehende EU-Werte gemappt (n:1)? Betrifft das noch weitere restricted Picklists aus der Liste? | Solution Design / Customer |
| 13 | Validierungsregeln | Account, Quote | `BillingState`/`ShippingState`, `Bill To State`/`Ship To State` | Live-Lauf: mehrere Account-Updates und Quote-Inserts fehlgeschlagen mit "state controlled by country"-Validierung (state-Wert ohne oder mit nicht erkanntem Country-Wert). | US-Adressdaten kommen mit US-State-Codes, aber State/Country-Picklists sind org-spezifisch konfiguriert — nicht jede US-Country/State-Kombination ist in CDEV5 als gültig hinterlegt. | Ist State/Country-Picklist in CDEV5 überhaupt aktiviert und vollständig für US-Adressen konfiguriert? Falls nein: wer pflegt das nach, oder migrieren wir Adressfelder vorerst als Freitext? | Tech Lead / Solution Design |
| 14 | Feldlängen-Limit | Asset | `Name` | Live-Lauf: 15 von 94 Asset-Inserts fehlgeschlagen — CDEV5 hat eine eigene Validierungsregel "The maximum allowed characters for the Asset Name are set to 40 due to SAP limitations", einige US-Quellwerte sind länger. | EU-seitige Business-Regel (SAP-Anbindung) ist strenger als die US-Quelldaten. Kein Bug, sondern eine echte Longtail-Datenqualitätsfrage. | Sollen zu lange Asset-Namen beim Import automatisch gekürzt werden (Truncation-Regel), oder soll das pro Fall manuell geprüft werden? | Solution Design / Customer |
| 15 | Duplicate-Management | Contact | — (Duplicate-Regel, kein Feld) | Live-Lauf: 8 von 24 Contact-Inserts wurden von einer aktiven Duplicate-Rule mit der Rückfrage "Use one of these records?" blockiert. | CDEV5 hat Duplicate-Rules aktiv, die bei automatisierten Bulk-Inserts (wie über SFDMU) nicht interaktiv bestätigt werden können und den Insert dadurch hart blockieren. | Sollen Duplicate-Rules für den Migrationslauf temporär deaktiviert werden (Standard-Praxis bei Datenmigrationen), oder soll vorher dedupliziert werden? | Tech Lead |
| 16 | Validierungsfehler (Feldkombination) | OpportunityLineItem (ggf. auch QuoteLineItem, OrderItem) | `UnitPrice`, `TotalPrice` | Live-Lauf: alle 5 OpportunityLineItem-Inserts fehlgeschlagen mit `field integrity exception: only one of unit price or total price may be specified`. | Die Query enthielt beide Preisfelder gleichzeitig — Salesforce berechnet eines aus dem anderen und lässt beide zusammen nicht zu. | **Bereits behoben:** `TotalPrice` wurde aus den Queries von `OpportunityLineItem`, `QuoteLineItem` und `OrderItem` entfernt (nur `UnitPrice` bleibt als Quellwert). Re-Test steht noch aus. | Tech Lead |
| 17 | Duplicate-Erkennung / SFDMU-Matching | PricebookEntry | `Pricebook2Id`, `Product2Id` | Live-Lauf: **weiterhin 0 erfolgreich**, selbst nach mehreren Fix-Versuchen (siehe Verlauf unten). Root-Cause noch nicht abschließend gelöst. | SFDMU klassifiziert **100 % der PricebookEntry-Zeilen als Insert, nie als Update** — trotz korrekt aufgelöster `Product2Id`/`Pricebook2Id`-Werte (verifiziert: beide zeigen auf real existierende CDEV5-Records) und trotz vollständig geladener 26.109 Ziel-Records. Der ursprüngliche Verdacht ("SFDMU lädt nicht alle Ziel-Records") wurde widerlegt. Wahrscheinlichste Erklärung: SFDMU vergleicht beim Matching die *rohen, nicht orgs-übersetzten* Lookup-Werte (Source-Id vs. Target-Id), während es für den tatsächlichen Insert-Payload die korrekt übersetzten Werte verwendet — dadurch matcht der Vergleich strukturell nie, obwohl das Endergebnis pro Zeile korrekt aussehen würde. | Braucht entweder SFDMU-Support/-Dokumentation zur korrekten Matching-Semantik bei zusammengesetzten Lookup-externalIds, oder einen alternativen Ansatz außerhalb von SFDMU (z. B. Vorab-Abgleich per eigenem Skript, dann nur echte Deltas migrieren). Nicht weiter per Trial-and-Error gegen Live-Daten testen — Kosten/Nutzen kippt. | Tech Lead |

**Lösungsversuche (2026-09-29, chronologisch):**
1. `Pricebook2`-Filter entfernt (7-Tage-Filter galt auch für Ziel-Abfrage) → PricebookEntry ging von "alle 37 fehlen mit `Required fields are missing`" zu "alle 37 fehlen mit `already exists`" — anderer Fehler, aber weiterhin 0 erfolgreich.
2. Hypothese "SFDMU lädt nicht alle 26k Ziel-Records" getestet, indem auch der `PricebookEntry`-Query-Filter selbst entfernt wurde → Log zeigt, alle 26.109 Ziel-Records wurden vollständig geladen, **trotzdem weiterhin 0 Updates, 27.058 Inserts, alle fehlgeschlagen.** Hypothese widerlegt.
3. `externalId` von `Product2Id;Pricebook2Id` auf die Relationship-Felder `Product2.ProductCode;Pricebook2.Name` umgestellt (SFDMU zieht diese Felder ohnehin automatisch) → **kompletter Absturz** der Config: SFDMU versuchte, `Pricebook2.Name` fälschlich direkt auf `OpportunityLineItem` anzuwenden (Zwei-Hop-Relationship-Bug). Zurückgesetzt auf Stand nach Schritt 2, damit die Config wieder lauffähig ist.

**Kein Datenschaden:** Alle Versuche sind als Insert fehlgeschlagen (0 Treffer geschrieben) — es wurden keine bestehenden CDEV5-Daten verändert oder dupliziert.

## Nächste Schritte (nicht ausgeführt)

- Keine Felder anlegen, bis Punkte 1–3 mit dem Kunden geklärt sind.
- Punkt 4 klärt, ob wir überhaupt auf der richtigen Vergleichsbasis (CDEV5 vs. eu-prod) arbeiten.
- Punkt 5 (Order.Name) sollte unabhängig vom Rest zeitnah in den Field Guide zurückgemeldet werden — einfacher Korrekturpunkt.
- **Punkt 6a ist jetzt der Top-Blocker** — ohne User-Mapping-Entscheidung bleibt jeder weitere Live-Lauf faktisch wirkungslos.
- Punkt 7 (fehlende externalIds) bleibt relevant, ist aber nachrangig, solange Punkt 6a nichts durchlässt.
- Punkt 10 (CreatedDate-Filter auf Pricebook2) sollte vor dem nächsten Lauf entschieden werden.
- Punkte 8–9 sind in `export.json` noch gar nicht abgebildet (weder Feld-Umbenennung noch Picklist-Wert-Mapping) — SFDMU kann beides technisch (Feld-Mapping per Alias, Value-Mapping per Add-On/CSV), aber nur nachdem die Zuordnung inhaltlich feststeht.
