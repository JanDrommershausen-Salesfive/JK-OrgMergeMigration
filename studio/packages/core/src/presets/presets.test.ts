import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { sameConfig } from './compare';
import { diffConfigs } from './diff';
import { PresetStore, slug } from './store';

const config = (extra: Record<string, unknown> = {}, query = 'SELECT Id, Email FROM Contact') => ({
    objects: [
        {
            query: 'SELECT Id, Name FROM Account',
            operation: 'Readonly',
            externalId: 'Name',
            master: false
        },
        { query, operation: 'Upsert', externalId: 'Email', ...extra }
    ]
});
const VM = 'ObjectName,FieldName,RawValue,Value\nContact,MailingCountry,USA,United States\n';

let dir: string;
let store: PresetStore;
const folder = () => path.join(dir, '020_Contact');
const writeCurrent = async (cfg: unknown, vm?: string | null) => {
    await writeFile(path.join(folder(), 'export.json'), JSON.stringify(cfg, null, 2));
    if (vm === null)
        await import('node:fs/promises').then((f) =>
            f.unlink(path.join(folder(), 'ValueMapping.csv')).catch(() => undefined)
        );
    else if (vm !== undefined) await writeFile(path.join(folder(), 'ValueMapping.csv'), vm);
};

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'preset-'));
    await mkdir(folder());
    await writeCurrent(config(), VM);
    store = new PresetStore(dir);
});

describe('PresetStore', () => {
    it('speichert den aktuellen Stand mit Datum und Namen im Ordnernamen', async () => {
        const p = await store.save('020_Contact', {
            name: 'Läuft: Länder mappen',
            note: 'erster guter Stand',
            now: new Date(2026, 9, 5, 14, 3, 7)
        });
        expect(p.id).toBe('2026-10-05_14-03-07_lauft-lander-mappen');
        expect(p).toMatchObject({
            name: 'Läuft: Länder mappen',
            note: 'erster guter Stand',
            source: 'manual',
            hasValueMapping: true,
            matchesCurrent: true
        });
        const files = (await readdir(path.join(folder(), 'presets', p.id))).sort();
        expect(files).toEqual(['ValueMapping.csv', 'export.json', 'meta.json']);
    });

    it('listet neueste zuerst und erkennt, welcher Stand dem aktuellen entspricht', async () => {
        const a = await store.save('020_Contact', {
            name: 'A',
            now: new Date(2026, 9, 5, 10, 0, 0)
        });
        await writeCurrent(config({ excludedFields: ['Phone'] }));
        const b = await store.save('020_Contact', {
            name: 'B',
            now: new Date(2026, 9, 5, 11, 0, 0)
        });
        const list = await store.list('020_Contact');
        expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
        expect(list.map((p) => p.matchesCurrent)).toEqual([true, false]);
    });

    it('stellt einen Stand wieder her und entfernt das Wertemapping, wenn der Stand keines hatte', async () => {
        await writeCurrent(config(), null);
        const noVm = await store.save('020_Contact', {
            name: 'ohne Werte',
            now: new Date(2026, 9, 5, 9, 0, 0)
        });
        expect(noVm.hasValueMapping).toBe(false);
        await writeCurrent(config({ excludedFields: ['Phone'] }), VM);
        await store.restore('020_Contact', noVm.id);
        expect(
            JSON.parse(await readFile(path.join(folder(), 'export.json'), 'utf8')).objects[1]
                .excludedFields
        ).toBeUndefined();
        await expect(stat(path.join(folder(), 'ValueMapping.csv'))).rejects.toThrow();
    });

    it('legt gleiche Namen in derselben Sekunde nicht übereinander', async () => {
        const now = new Date(2026, 9, 5, 9, 0, 0);
        const a = await store.save('020_Contact', { name: 'x', now });
        const b = await store.save('020_Contact', { name: 'x', now });
        expect(b.id).toBe(`${a.id}-2`);
    });

    it('löscht einen Stand und lehnt Pfadtricks ab', async () => {
        const p = await store.save('020_Contact', { name: 'weg' });
        await store.delete('020_Contact', p.id);
        expect(await store.list('020_Contact')).toEqual([]);
        await expect(store.get('020_Contact', '../..')).rejects.toThrow(/Unbekannter Stand/);
        await expect(store.get('999_X', p.id)).rejects.toThrow(/Unbekannter Ordner/);
    });

    it('slug macht aus Namen sichere Ordnernamen', () => {
        expect(slug('  Über/Alles  ')).toBe('uber-alles');
        expect(slug('///')).toBe('stand');
    });
});

describe('sameConfig', () => {
    it('ignoriert Reihenfolge der Schlüssel, Einrückung und fehlendes gegen leeres Wertemapping', () => {
        const a = { exportJson: JSON.stringify({ b: 1, a: [{ y: 1, x: 2 }] }), valueMapping: null };
        const b = {
            exportJson: JSON.stringify({ a: [{ x: 2, y: 1 }], b: 1 }, null, 4),
            valueMapping: 'ObjectName,FieldName,RawValue,Value\n'
        };
        expect(sameConfig(a, b)).toBe(true);
        expect(sameConfig(a, { ...b, valueMapping: VM })).toBe(false);
    });
});

describe('diffConfigs', () => {
    const files = (cfg: unknown, vm: string | null = VM) => ({
        exportJson: JSON.stringify(cfg),
        valueMapping: vm
    });
    const texts = (from: ReturnType<typeof files>, to: ReturnType<typeof files>) =>
        diffConfigs(from, to).map((c) => c.text);

    it('meldet nichts bei gleichem Stand', () => {
        expect(texts(files(config()), files(config()))).toEqual([]);
    });

    it('beschreibt Felder, Filter, Mapping, Ausschlüsse und Parent-Modus in Klartext', () => {
        const to = {
            objects: [
                {
                    query: 'SELECT Id, Name, Industry FROM Account',
                    operation: 'Upsert',
                    externalId: 'Name',
                    master: false
                },
                {
                    query: "SELECT Id, Email, Phone FROM Contact WHERE Country = 'DE'",
                    operation: 'Upsert',
                    externalId: 'Email',
                    fieldMapping: [{ sourceField: 'Phone', targetField: 'Mobile__c' }],
                    excludedFields: ['Fax']
                }
            ]
        };
        const result = texts(files(config()), files(to));
        expect(result).toContain('Contact (Hauptobjekt): Felder hinzugefügt: Phone');
        expect(result).toContain("Contact (Hauptobjekt): Filter kein Filter → Country = 'DE'");
        expect(result).toContain('Contact (Hauptobjekt): Mapping Phone → Mobile__c hinzugefügt');
        expect(result).toContain('Contact (Hauptobjekt): von der Migration ausgeschlossen: Fax');
        expect(result).toContain('Account (Parent): Nur lesen → Mitziehen');
        expect(result).toContain('Account (Parent): Felder hinzugefügt: Industry');
    });

    it('meldet geänderte Wertemapping-Zeilen und entfernte Parents', () => {
        const to = { objects: [config().objects[1]] };
        const vm =
            'ObjectName,FieldName,RawValue,Value\nContact,MailingCountry,USA,United States of America\nContact,MailingCountry,UK,United Kingdom\n';
        const result = texts(files(config()), files(to, vm));
        expect(result).toContain('Account (Parent) entfernt');
        expect(result).toContain(
            'Wertemapping Contact.MailingCountry: USA: United States → United States of America'
        );
        expect(result).toContain(
            'Wertemapping Contact.MailingCountry: UK → United Kingdom hinzugefügt'
        );
    });
});
