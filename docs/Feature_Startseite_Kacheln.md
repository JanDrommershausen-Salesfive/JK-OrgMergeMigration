# Feature: Startseite mit Kacheln

Stand: 2026-10-02 · Status: Konzept, noch nicht gebaut

## Ziel

Die Startseite (heute die Tabelle "Übersicht") wird zu einem Kachel-Dashboard: Auf einen Blick sehen, wo die Migration steht, und von dort in die Bereiche springen. Sie ist der Einstieg für jede Person im Projekt und soll auch in anderen Projekten funktionieren ([Feature_Org_Auswahl_und_Projektunabhaengigkeit.md](Feature_Org_Auswahl_und_Projektunabhaengigkeit.md)).

## Aufbau

Oben eine Reihe Kennzahlen, darunter Kacheln je Bereich. Jede Kachel zeigt eine Kurzinfo und führt per Klick in den Bereich. Die bisherige Objekttabelle bleibt erhalten, als eigener Abschnitt unter den Kacheln oder hinter der Kachel "Objekte".

### Kennzahlen (oberste Reihe)

| Kennzahl | Quelle |
|---|---|
| Objekte mit Lauf / gesamt | `/api/objects` (letzter Lauf je Objekt) |
| Läufe heute, davon fehlgeschlagen | `/api/results/all` |
| Offene Fehler und fehlende Parents im letzten Lauf je Objekt | `lastRun.errors`, `lastRun.missingParents` |
| Aktive Kohorte, Größe | `/api/cohorts` |
| Datenspeicher der Ziel-Sandbox (später) | Org-Limits der Ziel-Org |

### Kacheln

| Kachel | Inhalt | Ziel |
|---|---|---|
| **Org-Manager** | Quelle und Ziel mit Verbindungsstatus, Typ (Sandbox/Production), Org-ID; Orgs wechseln, neu anmelden, Verbindung prüfen | öffnet den Org-Dialog |
| **Konfiguration / Mapping** | Fortschritt: wie viele Objekte haben eine Query, ein Mapping, offene Pflichtfelder im Ziel | `/konfiguration` |
| **Läufe** | die letzten drei Läufe mit Status, Zahl der Fehler; Link auf alle | `/laeufe` |
| **Kohorten** | aktive Kohorte, Größe, geschätzter Speicher; Schnellzugriff "Neue Kohorte" | `/kohorten` |
| **Tools** | Sammelplatz für Werkzeuge: Sandbox leeren, Query-Prüfung, Export von Mapping-Dokumentation, Log-Suche | eigene Unterseite |
| **Klärungsliste** | offene Punkte aus der Klärungsliste in `docs/` | zeigt die Datei |
| **Chat** (später) | Frage an Claude zur Migration | [GUI_Chat_mit_Claude_Code.md](GUI_Chat_mit_Claude_Code.md) |
| **Einstellungen** (später) | Projektname, Ordner, geschützte Orgs, Umgebungsprofile | eigene Seite |

## Offene Ideen

- Ampel je Objekt (grün: Lauf ohne Fehler und ohne fehlende Parents, gelb: Warnungen, rot: Fehler oder nie gelaufen).
- Kachel "Nächster Schritt": schlägt vor, was als Nächstes sinnvoll ist (zum Beispiel "Pflichtfelder bei Account offen", "Contact hat 37 fehlende Parents, Account zuerst laufen lassen").
- Kachel "Sandbox-Speicher" mit Verbrauch gegen Limit, sobald die Limit-Abfrage gebaut ist.
- Zeitleiste der letzten Läufe als kleine Grafik.
- Neues Projekt einrichten (Assistent) als Kachel, wenn noch keine Orgs gewählt sind.

## Technik

- Kachel-Komponente `components/Tile.tsx` (Titel, Kennzahl, Untertext, Link, Zustand) und eine Seite `pages/DashboardPage.tsx`, die nur bestehende Abfragen kombiniert. Daten kommen aus den vorhandenen Endpunkten; neu nötig sind nur Org-Limits (Speicher) und eine Zusammenfassung des Mapping-Fortschritts.
- Der Mapping-Fortschritt braucht Describe-Daten für alle Objekte und ist deshalb teuer. Deshalb nicht beim Laden der Seite berechnen, sondern auf Knopfdruck oder aus einem zwischengespeicherten Wert.
- Jede Kachel lädt unabhängig und zeigt einen eigenen Ladezustand, damit die Seite nicht auf die langsamste Abfrage wartet.
- Kacheln für spätere Bereiche (Chat, Einstellungen) sind sichtbar, aber als "bald" markiert und deaktiviert, damit die Struktur klar ist.

## Zu klären

- Soll die Tabelle "Übersicht" auf der Startseite bleiben oder in einen eigenen Menüpunkt "Objekte" wandern?
- Welche Kennzahlen sind für die Migrationsexperten am wichtigsten (Fehler, fehlende Parents, Speicher, Zeit)?
- Welche Werkzeuge gehören unter "Tools" (Sandbox leeren zuerst)?
