# Feature: Org-Auswahl und projektunabhängige GUI

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Die GUI soll nicht nur für JK (US PROD → EU CDEV5) funktionieren, sondern in jedem Migrationsprojekt einsetzbar sein. Dafür dürfen Orgs, Objektliste und Regeln nicht mehr im Code stehen, sondern kommen aus einer Projektkonfiguration und einer Org-Auswahl beim Start.

## Ist-Zustand (fest verdrahtet)

- [sfdmu/run.sh](../sfdmu/run.sh): `SOURCE_ALIAS`, `TARGET_ALIAS`, `EXPECTED_SOURCE_ID`, `EXPECTED_TARGET_ID`, `PROD_ORG_IDS` als Konstanten.
- GUI-Server: Org-Status basiert auf denselben Aliasen.
- Objektordner `010_Account` … sind JK-spezifisch.

## Org-Auswahl beim Start

1. GUI liest die angemeldeten Orgs (`sf org list --json`) und zeigt sie mit Alias, Username, Instanz und Typ (Produktion, Sandbox, Scratch).
2. Nutzer wählt **Quelle** und **Ziel** je aus der Liste. Ist eine Org nicht angemeldet: Button "Org anmelden" (`sf org login web`) im GUI.
3. Typ der Org per SOQL absichern (`SELECT IsSandbox FROM Organization`), nicht nur aus Aliasnamen ableiten. Alternative Quellen in `sf org list` vorher prüfen.
4. Bestätigungsdialog zeigt beide Orgs mit Org-ID und Instanz-URL. Erst dann wird die Auswahl **gepinnt** (Org-ID gespeichert).
5. Bei jedem Lauf prüft die Logik wie heute in `run.sh`, ob die Alias-Auflösung noch zur gepinnten Org-ID passt.

## Sicherheitsregeln (projektübergreifend)

- Ziel darf standardmäßig **nie** eine Produktivorg sein (`IsSandbox = false` → blockiert). Aufheben nur bewusst pro Projekt in der Konfiguration, mit Warnhinweis.
- Quelle und Ziel dürfen nicht dieselbe Org sein.
- Live-Läufe und Sandbox-Leeren verlangen das Eintippen des Ziel-Alias (wie heute).
- Schreibende Funktionen sind nur aktiv, wenn Ziel gepinnt und bestätigt ist.

## Projektkonfiguration

Eine Datei pro Projekt, zum Beispiel `migration.project.json` im Projektordner (ohne Zugangsdaten, darf ins Git):

```json
{
  "name": "JK US → EU",
  "source": { "alias": "us-prod", "orgId": "00DDn000006CppDMAS" },
  "target": { "alias": "CDEV5", "orgId": "00D9K00000KSJIxUAP" },
  "protectedOrgIds": ["00DDn000006CppDMAS", "00D7Q00000Ch276UAB"],
  "objectsDir": "sfdmu",
  "docsDir": "docs"
}
```

- Die Datei entsteht aus der Org-Auswahl, nicht von Hand.
- `run.sh` und GUI lesen alles aus dieser Datei, keine Konstanten mehr im Skript.
- Pro Projekt mehrere Zielprofile möglich (zum Beispiel `CDEV5`, später Full Copy). Siehe [Feature_ETL_Konfiguration.md](Feature_ETL_Konfiguration.md), Abschnitt Umgebungsprofile.

## Trennung Werkzeug und Projekt

- **Werkzeug (allgemeingültig):** GUI, Server, Lauf-Logik, Batch-Logik, Sicherheitsprüfungen.
- **Projekt (spezifisch):** Projektkonfiguration, Objektordner mit `export.json`, Wertemapping, `docs/`.
- Start mit Projektpfad: `npm run sfdmu:gui -- --project <Pfad>`. Ohne Pfad: aktuelles Verzeichnis, sonst Projektauswahl im GUI.
- Mittelfristig eigenes Repo für das Werkzeug, das Projekte einbinden. Bis dahin im JK-Repo bauen, aber nichts JK-Spezifisches im Werkzeugcode lassen.

## Was heute noch JK-spezifisch ist und raus muss

- Aliase, Org-IDs, Produktions-IDs in `run.sh`.
- Objektliste und Reihenfolge (010–160) → aus der Konfiguration (siehe [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md)).
- Texte, Logo und Ordnernamen in der GUI.

## Offene Fragen

- Reicht `sf org list` mit angemeldeten Orgs, oder soll die GUI eigene Anmeldung verwalten? (Empfehlung: nur die `sf`-CLI nutzen, keine eigenen Tokens speichern.)
- Wie wird bei mehreren Projekten umgeschaltet: Projektordner pro Start oder Projektwechsel im GUI?
- Wo liegt das Werkzeug langfristig (eigenes Repo, npm-Paket)?
