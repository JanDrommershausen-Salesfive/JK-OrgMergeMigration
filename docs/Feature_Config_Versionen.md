# Feature: Versionen (Presets) der Konfiguration

Stand: 2026-10-05 · Status: umgesetzt (Konfiguration → Objekt → Reiter "Versionen")

## Ziel

Die Konfiguration eines Objekts ändert sich beim Ausprobieren laufend. Wenn eine Variante funktioniert und man danach etwas verändert, soll man den guten Stand wiederfinden und zurückholen können, ohne dass jede kleine Änderung protokolliert wird. Deshalb wird **manuell** gespeichert.

## Was gespeichert wird

Pro Objektordner unter `<Objektordner>/presets/<Datum>_<Zeit>_<Name>/`:

| Datei | Inhalt |
|---|---|
| `export.json` | Query, Filter, Parent-Modi, Feld-Mapping, Ausschlüsse (alles, was die GUI dort ändert) |
| `ValueMapping.csv` | Wertemapping dieses Objekts (und mitgezogener Parents); fehlt, wenn es zum Zeitpunkt keines gab |
| `meta.json` | Name, Notiz, Zeitpunkt, Art (`manual` oder `backup`) |

Beispiel: `sfdmu/020_Contact/presets/2026-10-05_14-03-07_laender-gemappt/`. SFDMU liest nur die Dateien im Objektordner, der Unterordner stört nicht. Die Stände liegen im Projekt und gehören **ins Git**: Dort stehen sie neben dem Git-Verlauf, den es ohnehin gibt, aber mit Namen und Absicht.

## Bedienung

- **Speichern:** Name und optionale Notiz, "Speichern". Gleiche Namen in derselben Sekunde bekommen ein Suffix, nichts wird überschrieben.
- **Liste:** neueste zuerst. Ein Stand, der dem aktuellen entspricht, trägt **= aktuell** (Vergleich ohne Rücksicht auf Reihenfolge der Schlüssel und Einrückung; "kein Wertemapping" und eine leere Wertemapping-Datei zählen als gleich) und lässt sich nicht erneut laden.
- **Vergleichen:** zeigt in Klartext, was sich ändert, wenn man den Stand lädt: Felder hinzugefügt oder entfernt, Filter, Parent-Modus (Nur lesen / Mitziehen), Mapping, Ausschlüsse, External ID, Wertemapping-Zeilen. Parents werden nach Objektname zugeordnet, eine andere Reihenfolge zählt nicht als Änderung.
- **Laden:** Dialog mit dem Vergleich und der Frage **"Aktuellen Stand vorher sichern?"**. Ja (voreingestellt) legt vorher einen Stand als **Backup** an ("Vor dem Laden von …", Name änderbar). Nein lädt direkt und überschreibt. Beim Laden werden `export.json` und `ValueMapping.csv` in den Objektordner kopiert. Hatte der Stand kein Wertemapping, wird die Datei im Objektordner entfernt, damit der Zustand exakt zurückkommt.
- **Löschen:** nach Rückfrage, nur der Stand selbst.
- Laden und Löschen sind während eines Migrations- oder Löschlaufs gesperrt (Laden verändert die Konfiguration, die der Lauf liest).

## Entscheidungen

- **Manuell statt automatisch:** Ein Stand je Änderung würde den Ordner mit Rauschen füllen. Wer alle Zwischenschritte sehen will, findet sie im Git.
- **Eigene Ordner statt einer Sammeldatei:** Jeder Stand ist ein lesbarer, kopierbarer Satz echter SFDMU-Dateien, im Git sauber zu vergleichen, auch ohne das Studio.
- **Backup ist selbst ein Stand:** keine zweite Mechanik, "Wiederherstellen" ist ein normales Laden.
- **Pro Objekt:** Die Konfiguration steckt vollständig im Objektordner (Zielobjekt und Parents in einer `export.json`, Wertemapping je Ordner).

## Noch offen

- Stand eines Objekts in ein anderes Projekt oder Objekt übernehmen (Vorlage).
- Kennzeichnung "zuletzt erfolgreich gelaufen" am Stand (Verknüpfung mit dem Lauf-Archiv), damit man den Stand zum letzten guten Lauf direkt findet.
- Umbenennen und Notiz nachträglich ändern.
- Aufräumen sehr vieler alter Stände.

## Bedienung in der Objekt-Konfiguration (Stand 2026-10-05)

Versionen liegen nicht mehr in einem eigenen Reiter, sondern in einer Seitenleiste: Der Knopf "Version: <Name> ▾" in der Kopfzeile öffnet sie ("nicht gespeichert", wenn der aktuelle Stand keiner Version entspricht). Die Konfiguration ist ein geführter Ablauf Übersicht → 1 Query → 2 Mapping → 3 Wertemapping mit Zurück/Weiter; die Übersicht zeigt den Status je Teil und den aktiven Stand. Unten steht eine feste Leiste mit dem letzten Lauf und "<Objekt>-Lauf starten"; der Startdialog nennt die verwendete Version.
