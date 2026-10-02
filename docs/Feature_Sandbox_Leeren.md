# Feature: Sandbox jederzeit leeren

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Die Ziel-Sandbox soll per Knopfdruck (und mit Absicherung) von migrierten Daten befreit werden, damit ein Testlauf schnell neu starten kann, ohne die Sandbox neu zu erstellen.

## Ansätze im Vergleich

| Ansatz | Vorteile | Nachteile |
|---|---|---|
| **Löschen per SFDMU** (Operation Delete, umgekehrte Reihenfolge) | Nutzt vorhandene Konfiguration und Org-Prüfungen | Pro Objekt ein Lauf, Konfiguration pro Objekt nötig |
| **Löschen per Bulk-API** (`sf data delete bulk` oder Hard Delete) | Schnell, einfach pro Objekt | Eigene Reihenfolge- und Fehlerlogik nötig |
| **Sandbox neu erstellen/refreshen** | Sauberster Zustand, auch Metadaten | Langsam, Refresh-Intervalle, setzt Metadaten zurück |

**Empfehlung:** Löschen über Bulk-API mit Hard Delete, gesteuert von der GUI in umgekehrter Abhängigkeitsreihenfolge (Kinder zuerst). Refresh nur, wenn auch Metadaten zurückgesetzt werden sollen.

## Wichtige Punkte

- **Reihenfolge:** Kinder vor Eltern (aus `dependsOn`, siehe [Feature_Zentrale_Konfiguration_und_Orchestrierung.md](Feature_Zentrale_Konfiguration_und_Orchestrierung.md)). Sonst scheitert das Löschen an Referenzen.
- **Papierkorb:** Gelöschte Datensätze belegen weiter Speicher, bis der Papierkorb geleert ist. Daher Hard Delete oder Papierkorb leeren, sonst bringt das Leeren bei Speicherlimits nichts.
- **Nur eigene Daten löschen:** Standardmäßig nur Datensätze, die aus der Migration stammen (zum Beispiel über ein Marker-Feld oder die Id-Liste aus dem Lauf, siehe [Feature_Lauf_Historie.md](Feature_Lauf_Historie.md)). Alles löschen nur als bewusste zweite Option, weil die Sandbox auch Testdaten anderer enthalten kann.
- **Systemobjekte und Automatisierung:** Trigger, Flows und Validierungsregeln feuern auch beim Löschen. Prüfen, ob sie das Löschen blockieren oder Nebenwirkungen haben.
- **Aufbewahrte Beziehungen:** Dateien (ContentDocument), Anhänge und Verlaufsdaten extra berücksichtigen.

## Sicherheitsrahmen (strikt)

- Nur gegen die gepinnte Ziel-Org. Org-ID wird vor dem Lauf mit der gepinnten ID verglichen.
- **Nie** gegen eine Produktivorg (`IsSandbox = false` blockiert hart). Siehe [Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md).
- Bestätigung durch Eintippen des Ziel-Alias, zusätzlich Anzeige der Anzahl der zu löschenden Datensätze je Objekt.
- Standardmäßig Vorschau (Zählung ohne Löschen), Löschen nur nach ausdrücklicher Bestätigung.
- Protokoll in der Historie.

## Ablauf in der GUI

1. Button "Sandbox leeren" im Bereich Ziel-Org.
2. Vorschau: Anzahl je Objekt, geschätzter freigegebener Speicher.
3. Bestätigung durch Eintippen des Aliases.
4. Löschen in Reihenfolge mit Live-Log, Abbruch bei Fehler.
5. Ergebnis (gelöscht, übrig, Fehler) und Hinweis auf den Papierkorb.

## Zu klären

- Typ und Berechtigungen der Sandbox: Darf die Integration `Hard Delete` nutzen (Berechtigung "Bulk API Hard Delete")?
- Gibt es in CDEV5 Daten, die nicht gelöscht werden dürfen (Basisdaten, Testdaten anderer)? Davon hängt "nur Migrationsdaten" oder "alles" ab.
- Marker für Migrationsdaten: eigenes Feld (Metadatenänderung in der Ziel-Org nötig) oder Id-Listen aus den Läufen?
