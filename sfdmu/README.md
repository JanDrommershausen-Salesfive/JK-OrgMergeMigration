# SFDMU — JK US PROD → JK EU CDEV5

One folder per object, so each object can be migrated on its own. The number prefix is the
recommended run order (parents before children).

## Setup (once per person)

```bash
sf plugins install sfdmu     # SFDMU is a global sf CLI plugin, not part of this repo
sf org login web --alias us-prod
sf org login web --alias CDEV5 --instance-url https://test.salesforce.com
```

## Usage

```bash
./run.sh                      # lists the object folders
./run.sh 020_Contact          # simulation only (-m), no writes
./run.sh 020_Contact --live   # writes to CDEV5, asks for a typed confirmation first
```

`run.sh` pins the source/target org IDs, refuses to write to a known production org and
derives `--canmodify` from the live target. A copy of `ValueMapping.csv` is synced into the
run folder before each run (gitignored there) — edit only the shared one in this directory.

## GUI

```bash
npm run sfdmu:gui     # then open http://127.0.0.1:4173
```

Pick an object, choose simulation or live, start. Live runs require typing the target alias.
Only one run at a time; closing the tab or "Abbrechen" stops the run. The GUI just calls
`run.sh`, so all safety checks apply. It needs no `npm install`, only Node.

## How the folders relate

Each `export.json` contains the object to migrate (full query, `Upsert`/`Insert`) plus its
parent objects as `Readonly`. Readonly entries are never written; they only let SFDMU
resolve lookups (e.g. `Contact.AccountId`) by the parent's `externalId` in the target. If a
parent has not been migrated yet, its children report missing parent records
(`<folder>/reports/MissingParentRecordsReport.csv`). So: run in numeric order.

Parents without an `externalId` (Order, Asset — all `Insert` objects) cannot be used as
Readonly parents, so these lookups stay unresolved:
- `110_OrderItem` → `OrderId`
- `130_Case` → `AssetId`

Needs a re-run-safe key for those objects first, see the Klärungsliste.

## Further notes

- Field/key decisions and open questions: [Klaerungsliste_US_EU_Feldabgleich_CDEV5.md](Klaerungsliste_US_EU_Feldabgleich_CDEV5.md)
- `Insert` objects duplicate on every rerun until an `externalId` is defined.
- Most queries filter `CreatedDate = LAST_N_DAYS:7`; the same filter is used on Readonly
  parents, so older parents show up as missing. Widen the filters for real runs.
- Not carried over from the first test config: the `OwnerId` workaround via
  `dataRetrievedAddons` is no longer in `export.json`. Users differ between US and EU, so an
  owner decision (Klärungsliste #6a) is still needed before `--live` runs.
