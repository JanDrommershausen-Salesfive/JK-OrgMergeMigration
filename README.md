# JK Org Merge Migration

Datenmigration US-Org → EU-Org (JK) mit SFDMU, inklusive lokaler GUI.

## Schnellstart

Voraussetzungen: Git, Node 18+ und die [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`).

```bash
git clone https://github.com/JanDrommershausen-Salesfive/JK-OrgMergeMigration.git
cd JK-OrgMergeMigration

sf plugins install sfdmu                                   # einmalig, globales sf-Plugin
npm --prefix studio install                                # einmalig, Abhängigkeiten der GUI

npm run studio                                             # Migration Studio, http://127.0.0.1:4174
```

Orgs werden in der GUI ausgewählt (**Orgs auswählen**) und bei Bedarf dort per Browser angemeldet, VS Code ist nicht nötig.
Die Auswahl pinnt die Org-IDs in `migration.project.json`. Die Datei ist lokal (nicht im Git): Wer neu klont, wählt die Orgs einmal selbst aus. Wurde der Ordner kopiert, ignoriert das Studio die mitkopierte Datei. `sfdmu/run.sh` liest dieselbe Datei und stoppt, wenn ein Alias auf eine andere Org zeigt oder die Datei aus einem anderen Ordner stammt.
Alternativ geht der Login weiter per CLI (`sf org login web --alias <alias>`).
Die ältere GUI ohne Build (`npm run sfdmu:gui`) bleibt vorerst erhalten. Details: [studio/README.md](studio/README.md), [sfdmu/README.md](sfdmu/README.md), Projektdokumente: [docs/](docs/).

---

# Salesforce DX Project: Next Steps

Now that you’ve created a Salesforce DX project, what’s next? Here are some documentation resources to get you started.

## How Do You Plan to Deploy Your Changes?

Do you want to deploy a set of changes, or create a self-contained application? Choose a [development model](https://developer.salesforce.com/tools/vscode/en/user-guide/development-models).

## Configure Your Salesforce DX Project

The `sfdx-project.json` file contains useful configuration information for your project. See [Salesforce DX Project Configuration](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_config.htm) in the _Salesforce DX Developer Guide_ for details about this file.

## Read All About It

- [Salesforce Extensions Documentation](https://developer.salesforce.com/tools/vscode/)
- [Salesforce CLI Setup Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_intro.htm)
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference.htm)
