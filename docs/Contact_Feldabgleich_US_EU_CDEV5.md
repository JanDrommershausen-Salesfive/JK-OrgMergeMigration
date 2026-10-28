# Contact: Feldabgleich US → EU (CDEV5)

Stand: 2026-10-28 · Quelle `jk-us-production` (10.994 Contacts), Ziel `jk-cdev5-org` (0 Contacts). Grundlage sind die Live-Feldlisten beider Orgs, nicht der Field Guide vom Oktober.

Dazu gehören:

- Konfiguration: [sfdmu/020_Contact/export.json](../sfdmu/020_Contact/export.json) und [ValueMapping.csv](../sfdmu/020_Contact/ValueMapping.csv)
- Arbeitsmappe (Kopie der Account-Mappe, Blätter "Contact Field Mapping" und "Picklist Mapping" neu befüllt): `Mappings/JK_SAP_Salesforce_Field_Guide_v5_vFinal_CDEV5.xlsx`

## Ergebnis in Zahlen

| | Felder |
|---|---|
| Quelle (US) | 89 |
| Ziel (CDEV5) | 112 |
| In beiden vorhanden | 86 |
| Nur US | 3 |
| Nur CDEV5 | 26 |

Die 21 "US only"-Felder aus dem Field Guide (`JK_VIP__c`, `SunLync__c`, `Contact_Type__c` …) **existieren inzwischen in CDEV5**, mit gleichem API-Namen, Typ und gleichen Werten (betrifft Klärungsliste #1: für CDEV5 ist die Lücke geschlossen, ob `eu-prod` sie hat, ist damit nicht geprüft). Zusätzlich gibt es auf beiden Seiten `Exclude_From_Installer_Map__c`, das im Field Guide fehlt.

## Nur in der US-Org

| Feld | Typ | US-Contacts befüllt | Entscheidung |
|---|---|---|---|
| `Suffix` | Text(40) | 9 | **Offen.** Standardfeld, in CDEV5 nicht aktiviert. In EU aktivieren, in ein anderes Feld legen oder verwerfen. Nicht in der Query. |
| `TitleType` ("Seniority Level") | Picklist | 0 | Nicht migriert. |
| `DepartmentGroup` | Picklist | 0 | Nicht migriert. Der Field Guide schlug `SC_Department__c` vor (Label-Ähnlichkeit 77 %); das passt nicht: US-Werte sind englische Schlüssel (`sales`, `tech` …), CDEV5 nutzt SAP-Codes (`0001`, `Z001` …). |

## Nur in CDEV5 (EU)

Nicht aus US-Daten befüllt:

- **Migrationsfeld:** `ContactCrossOrgTraceID__c` bekommt die US-Id (Mapping `Id` → `ContactCrossOrgTraceID__c`, wie `AccountCrossOrgTraceID__c` beim Account).
- **SAP/EU-Prozess:** `SapIntegrationId__c`, `SAP_Relevant__c`, `SC_PartnerID__c`, `SC_Language__c`, `SC_Title__c`, `SC_Department__c`, `SalesC_AcademicTitle__c`, `IsActive__c`, `Contact_Account__c` (Formel), `SC_Acc_SAP_Integration_Id__c` (Formel), `SAPID_Number__c` (Formel).
- **Marketing:** `SalesC_Lead_Creation__c`, `SalesC_gclid__c`, `SalesC_utm_campaign__c`, `SalesC_utm_content__c`, `SalesC_utm_medium__c`, `SalesC_utm_source__c`, `SalesC_utm_term__c`.
- **Systemfelder der Org:** `CurrencyIsoCode` (siehe offene Punkte), `IndividualId`, `IsPersonAccount`.
- **Länder-/Bundesländer-Picklists:** `MailingCountryCode`, `MailingStateCode`, `OtherCountryCode`, `OtherStateCode`. In CDEV5 sind sie aktiv, in der US-Org nicht (dort Freitext). Geschrieben wird weiter `MailingCountry` / `MailingState` als Text; CDEV5 prüft ihn gegen die Liste.

## Was in der Query steht

59 Felder plus `Id`: alle in beiden Orgs vorhandenen, in der Quelle schreibbaren Felder. Nicht enthalten:

- **Systemfelder und Formeln** (`Name`, `IsDeleted`, Adress-Compound-Felder, `LastActivityDate` …).
- **`OwnerId`:** wie beim Account, SFDMU kann User nicht auflösen. Offen bleibt die Owner-Entscheidung (Klärungsliste #6).
- **Geocodes** (`MailingLatitude`, `…Longitude`, `…GeocodeAccuracy`, jeweils auch `Other…`): wie beim Account weggelassen.
- **Audit-Felder** (`CreatedDate`, `LastModifiedDate`): gleiche Blockade wie beim Account, siehe unten. Nicht in der Query.

Aufbau: `Account` als `Readonly`-Parent (`master: false`, Mapping `Id` → `AccountCrossOrgTraceID__c`) und `Contact` als `Upsert` mit External ID `Id` (Mapping auf `ContactCrossOrgTraceID__c`). Die bisherige External ID `Email` ist weg: nur 7.905 von 10.994 Contacts haben eine, und sie ist nicht eindeutig. Ein Filter fehlt bewusst, der Umfang kommt von der Kohorte (Studio). Der Parent muss neben `Id` ein zweites Feld haben (`Name`), sonst entfernt SFDMU den Parent samt `AccountId`-Lookup.

## Picklists

| Feld | US-Werte | Ergebnis |
|---|---|---|
| `Contact_Type__c` | 13 | 1:1, alle Werte in CDEV5 |
| `SunLync_Contact_Type__c` | 8 | 1:1 |
| `Time_Zone__c` | 5 | 1:1 |
| `Pronouns`, `GenderIdentity`, `ContactSource` | | identisch, in den US-Daten nicht befüllt |
| `BuyerAttributes` | 8 | CDEV5 hat keine Werte, in den US-Daten nicht befüllt |
| `Salutation` | `Mr.`, `Ms.`, `Mrs.`, `Dr.` (+ `Prof.`) | CDEV5 kennt `Mr.`, `Ms.`, `Company`. `Mr.`/`Ms.` 1:1. **`Mrs.` (6 Contacts) und `Dr.` (5) offen**, siehe unten. |
| `LeadSource` | 33 (+7 inaktive, die in Daten vorkommen) | Werte komplett verschieden. **Vorschlag:** gleiche Zuordnung wie `Account.AccountSource` (JK-US-Feedback, 40 Zeilen). Für Contact nicht bestätigt. |
| `MailingCountry` (Text) | 16 Schreibweisen | `USA`, `US`, `UNITED STATES`, `usa` → `United States`; `England` → `United Kingdom`; `PH` → `Philippines`; `MX` → `Mexico`; `MI`, `MN` (Bundesstaaten im Länderfeld) → `United States`. |

## Befunde, die einen Lauf betreffen (aus der Simulation)

Simulation mit der Konfiguration, 10.994 Contacts, nichts geschrieben:

1. **1.279 Contacts haben ein Bundesland, aber kein Land** (11,6 %). CDEV5 weist das ab: "A country/territory must be specified before specifying a state value". Dieselbe Fehlermeldung kam beim Account-Live-Lauf (7 Fälle). Mit einem Value Mapping nicht lösbar, weil das Land leer ist. Optionen: Land vorher in der US-Org nachziehen (die Bundesländer sind fast alle US-Kürzel), Land aus dem Account übernehmen, oder State/Country-Picklists in CDEV5 für die Migration anders behandeln.
2. **4 weitere Länder-/Bundesland-Werte sind ungültig:** Land `United States Minor Outlying Islands` (kein Eintrag in CDEV5), Bundesland `Ap` (US), `72707` (Philippinen), `Mexico` (Mexiko).
3. **10.553 von 10.994 Contacts haben im Ziel noch keinen Account** (nur 93 Accounts in CDEV5): der Missing-Parent-Report ist erwartbar, bis die Accounts der Kohorte migriert sind. Reihenfolge: erst Account, dann Contact.
4. **Duplicate Rules in CDEV5** blockierten im Live-Lauf vom 29.09. 8 von 24 Contact-Inserts (Klärungsliste #15). Unverändert offen.
5. **`ReportsToId`** (87 Contacts) wird in einem Folgedurchlauf gesetzt; der Vorgesetzte muss im selben Lauf liegen.

## Offene Entscheidungen

| # | Frage |
|---|---|
| 1 | `Salutation`: Was passiert mit `Mrs.` (6) und `Dr.` (5)? Möglich: `Mrs.` → `Ms.`; `Dr.` unverändert übernehmen (Feld ist nicht restricted) oder in `SalesC_AcademicTitle__c` (SAP-Codes) legen. Ohne Entscheidung werden sie unverändert übernommen. |
| 2 | `LeadSource`: Gilt für Contacts dieselbe Zuordnung wie für `Account.AccountSource`? |
| 3 | `CurrencyIsoCode`: Account bekommt `USD` für alle (Feedback JK US). Soll das für Contacts genauso gelten? Der Mechanismus (fester Wert über ein Trägerfeld) ist vorhanden; `Suffix` käme als Träger in Frage. |
| 4 | `Suffix` (9 Contacts): anlegen, verlagern oder verwerfen? |
| 5 | Bundesland ohne Land (1.279 Contacts): welcher Weg? |
| 6 | Audit-Felder: gleiche Blockade wie beim Account (US-Org hat Einstellung und Recht nicht). |
| 7 | Owner-Zuordnung (Klärungsliste #6). |

Von JK US liegt für Contact noch kein Feedback vor. In der Arbeitsmappe stehen deshalb keine "JK US:"-Zeilen, nur die Prüfung vom 2026-10-28.
