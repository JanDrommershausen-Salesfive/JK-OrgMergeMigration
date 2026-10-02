# SFDMU — Objektumfang und offene Punkte (Stand Feasibility-Test)

Übernommen aus dem README der ersten Test-Config. Die Struktur ist inzwischen pro Objekt aufgeteilt, siehe [`sfdmu/README.md`](../sfdmu/README.md).

## Object/field scope

`export.json` now covers every object from
`JK_SAP_Salesforce_Field_Guide_v5_vFinal.xlsx` (nicht im Repo, lag lokal unter `00 Dokumente/JK Mappings/`)
that has at least one field flagged **"Mappable - exact API name match"**: Account, Contact,
Product2, Pricebook2, PricebookEntry, Opportunity, OpportunityLineItem, Quote, QuoteLineItem,
Order, OrderItem, Asset, Case, Task, Event, ContentVersion. Each object's query includes
every field the guide marked as exact-match-mappable for that object (fields marked "Probably
mappable", "US org only" or "EU org only" are intentionally excluded — see
[`Klaerungsliste_US_EU_Feldabgleich_CDEV5.md`](Klaerungsliste_US_EU_Feldabgleich_CDEV5.md) for
those).

Two fields/objects from the field guide were dropped after the simulation surfaced SOQL
errors — SFDMU auto-adds a `.Name`/`.DeveloperName` traversal for lookup fields to help
matching, and the Salesforce API rejects that traversal for these particular relationships:
- **`ContentDocument`** dropped entirely (`ArchivedById` → `ArchivedBy.Name` fails). Not a
  loss for the test anyway — `ContentDocument` is normally created automatically when
  `ContentVersion` is inserted, not migrated directly.
- **`Product2.ExternalDataSourceId`** dropped from the Product2 query (same issue, niche
  field, unlikely to carry real data here).

Every object should have an `externalId` — otherwise every rerun duplicates data instead of
updating it. Current state per object:

| Object | Operation | externalId | Status |
|---|---|---|---|
| Account | Upsert | `Name` | placeholder, not guaranteed unique |
| Contact | Upsert | `Email` | placeholder, not guaranteed unique |
| Opportunity | Upsert | `Name;AccountId;CloseDate` | placeholder, not guaranteed unique |
| Product2 | Upsert | `ProductCode` | reasonable candidate, unverified |
| Pricebook2 | Upsert | `Name` | reasonable candidate, unverified |
| PricebookEntry | Upsert | `Product2Id;Pricebook2Id` | standard SFDMU pattern for this object |
| Quote | Upsert | `Name;OpportunityId` | reasonable candidate, unverified |
| OpportunityLineItem | Insert | — | no reliable key found, see Open items |
| QuoteLineItem | Insert | — | no reliable key found, see Open items |
| Order | Insert | — | no reliable key found, see Open items |
| OrderItem | Insert | — | no reliable key found, see Open items |
| Asset | Insert | — | no reliable key found, see Open items |
| Case | Insert | — | no reliable key found, see Open items |
| Task | Insert | — | no reliable key found, see Open items |
| Event | Insert | — | no reliable key found, see Open items |
| ContentVersion | Insert | — | file content not migrated anyway, see Open items |

**Everything marked "Insert" duplicates on every rerun** — acceptable for a one-off
feasibility read, not for a repeatable migration.

## Open items

See [`Klaerungsliste_US_EU_Feldabgleich_CDEV5.md`](Klaerungsliste_US_EU_Feldabgleich_CDEV5.md)
for the full list with proposed candidate keys per object. Highlights:

- **`Order.Name` doesn't exist.** The field guide lists it as "Mappable - exact API name
  match", but the standard `Order` object has no `Name` field in Salesforce (it uses
  `OrderNumber`/`OrderReferenceNumber` instead) — confirmed via a direct SOQL query against
  CDEV5 that failed with `INVALID_FIELD`. This is a field-guide data error, not a CDEV5 gap —
  worth flagging back into the field guide itself.
- **User lookups** (`OwnerId`, `ActivatedById`, `CompanyAuthorizedById`,
  `CustomerAuthorizedById`, `AssetProvidedById`, `AssetServicedById`) — Users differ between
  `us-prod` and `CDEV5`, so these all failed with `owner cannot be blank` on the first live
  run (see Klärungsliste #6a). **Workaround in place:** `dataRetrievedAddons` in `export.json`
  uses the core `RecordsTransform` Add-On to force every one of these fields to a fixed
  default owner (`0059K00000XlwK5QAJ`, the CDEV5 user currently authenticated for this test).
  This unblocks the feasibility test but is **not** the real answer — every migrated record
  ends up owned by one person regardless of who really owned it in `us-prod`. The actual
  default-owner decision (Klärungsliste #6a) is still open for a real migration.
- **Polymorphic lookups** (`WhatId`, `WhoId` on Task/Event; `ParentId` on Case/Asset) point at
  different object types depending on the record — SFDMU support for these is untested here.
- **ContentVersion**: the field guide's mapped fields are metadata only (`Title`,
  `ContentSize`, …) — the actual file bytes (`VersionData`, `PathOnClient`) aren't in the
  mapping doc and aren't queried here. This config will **not** migrate real file content.
- EU org has no Full Copy sandbox (only Partial Copy, used for UAT) — plan a dry run
  (`-m` simulation mode) before targeting anything but a scratch/dev org.
