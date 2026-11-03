import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

const port = 4174;
const headers = { host: `127.0.0.1:${port}` };
let app: Awaited<ReturnType<typeof buildApp>>;
let projectDir = '';

beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'proj-'));
    projectDir = dir;
    const sfdmu = path.join(dir, 'sfdmu');
    await mkdir(path.join(sfdmu, '020_Contact'), { recursive: true });
    await writeFile(
        path.join(dir, 'migration.project.json'),
        JSON.stringify({
            name: 'T',
            source: { alias: 'a', orgId: '00D000000000001' },
            target: { alias: 'b', orgId: '00D000000000002' },
            protectedOrgIds: ['00D000000000001']
        })
    );
    await writeFile(
        path.join(sfdmu, '020_Contact', 'export.json'),
        JSON.stringify({
            objects: [
                {
                    query: 'SELECT Id, Email, Phone, Fax FROM Contact',
                    operation: 'Upsert',
                    externalId: 'Email'
                }
            ]
        })
    );
    app = await buildApp({ projectDir: dir, port });
});

describe('sfdmu-Routen', () => {
    it('listet Objekte', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/objects', headers });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            configured: true,
            sourceAlias: 'a',
            targetAlias: 'b',
            objects: [{ folder: '020_Contact', object: 'Contact', externalId: 'Email' }]
        });
    });

    it('liefert 404 für einen unbekannten Ordner', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/object?folder=999_X', headers });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Unbekannter Ordner.' });
    });

    it('schließt ein Feld aus und gibt das Detail zurück', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/exclude',
            headers,
            payload: { folder: '020_Contact', field: 'Fax', excluded: true }
        });
        expect(res.statusCode).toBe(200);
        const fax = res.json().fields.find((f: { name: string }) => f.name === 'Fax');
        expect(fax.excluded).toBe(true);
    });

    it('weist ungültige Anfragen mit 400 ab', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/exclude', headers, payload: {} });
        expect(res.statusCode).toBe(400);
    });

    it('lehnt External-ID-Ausschluss mit 400 und Meldung ab', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/exclude',
            headers,
            payload: { folder: '020_Contact', field: 'Email', excluded: true }
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/External-ID/);
    });
});

describe('Projekt ohne Orgs', () => {
    it('meldet configured=false und sperrt Org-Abfragen', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'empty-'));
        const empty = await buildApp({ projectDir: dir, port });
        const objects = await empty.inject({ method: 'GET', url: '/api/objects', headers });
        expect(objects.json()).toMatchObject({
            configured: false,
            staleProjectPath: null,
            objects: [],
            sourceAlias: ''
        });
        const orgs = await empty.inject({ method: 'GET', url: '/api/orgs', headers });
        expect(orgs.statusCode).toBe(409);
        expect(orgs.json().error).toMatch(/Noch keine Orgs/);
    });

    it('lehnt ungültige Aliase bei Login und Auswahl ab', async () => {
        const bad = await app.inject({
            method: 'POST',
            url: '/api/orgs/login',
            headers,
            payload: { alias: '--evil', kind: 'production' }
        });
        expect(bad.statusCode).toBe(400);
        const sel = await app.inject({
            method: 'POST',
            url: '/api/orgs/select',
            headers,
            payload: { sourceAlias: 'a b', targetAlias: 'x' }
        });
        expect(sel.statusCode).toBe(400);
    });
});

describe('Ergebnis-Routen', () => {
    const id = '2026-10-02T16-24-38Z';

    beforeAll(async () => {
        const dir = path.join(projectDir, 'runs', '020_Contact', id);
        await mkdir(path.join(dir, 'target'), { recursive: true });
        await writeFile(
            path.join(dir, 'meta.json'),
            JSON.stringify({
                id,
                folder: '020_Contact',
                object: 'Contact',
                mode: 'simulation',
                startedAt: '2026-10-02T16:24:38.000Z',
                endedAt: '2026-10-02T16:24:42.000Z',
                durationMs: 4000,
                ok: true,
                stopped: false,
                exitCode: 0,
                signal: null,
                sourceAlias: 'a',
                targetAlias: 'b',
                counts: {
                    inserted: 1,
                    updated: 0,
                    deleted: 0,
                    errors: 1,
                    missingParents: 0,
                    warnings: 0
                },
                summary: [],
                warnings: [],
                logErrors: []
            })
        );
        await writeFile(path.join(dir, 'log.txt'), 'LOGTEXT');
        await writeFile(
            path.join(dir, 'target', 'Contact_insert_target.csv'),
            '"Id","Old Id","Email","Errors"\n"F1","003A","a@b.de","Pflichtfeld fehlt"\n"F2","003B","ok@b.de","#N/A"\n'
        );
        await writeFile(
            path.join(dir, 'target', 'Contact_update_target.csv'),
            '"Id","Old Id","ParentId","Errors"\n"U1","003C","001X","#N/A"\n"U2","003D","001Y","#N/A"\n'
        );
    });

    it('listet Läufe und liefert Details, Log und CSV', async () => {
        const list = await app.inject({
            method: 'GET',
            url: '/api/results?folder=020_Contact',
            headers
        });
        expect(list.json().runs.map((r: { id: string }) => r.id)).toEqual([id]);

        const detail = await app.inject({
            method: 'GET',
            url: `/api/results/run?folder=020_Contact&id=${id}`,
            headers
        });
        expect(detail.json()).toMatchObject({
            errorsTotal: 1,
            errors: [{ error: 'Pflichtfeld fehlt' }],
            insertedTotal: 1,
            inserted: [{ file: 'insert', id: 'F2', oldId: '003B', label: 'ok@b.de' }],
            updatedTotal: 2,
            updated: [{ id: 'U1', oldId: '003C' }, { id: 'U2' }]
        });

        const log = await app.inject({
            method: 'GET',
            url: `/api/results/log?folder=020_Contact&id=${id}`,
            headers
        });
        expect(log.json()).toEqual({ log: 'LOGTEXT' });

        const csv = await app.inject({
            method: 'GET',
            url: `/api/results/export?folder=020_Contact&id=${id}&kind=errors`,
            headers
        });
        expect(csv.headers['content-type']).toMatch(/text\/csv/);
        expect(csv.headers['content-disposition']).toMatch(/attachment/);
        expect(csv.body).toContain('Pflichtfeld fehlt');
    });

    it('exportiert erfolgreiche Zeilen je Operation mit allen Spalten, ohne Fehlerzeilen', async () => {
        const get = (kind: string) =>
            app.inject({
                method: 'GET',
                url: `/api/results/export?folder=020_Contact&id=${id}&kind=${kind}`,
                headers
            });
        const inserted = await get('inserted');
        expect(inserted.statusCode).toBe(200);
        expect(inserted.headers['content-disposition']).toContain(`020_Contact_${id}_inserted.csv`);
        expect(
            inserted.body
                .replace(/^\uFEFF/, '')
                .trim()
                .split('\n')
        ).toEqual(['Id,Old Id,Email', 'F2,003B,ok@b.de']);
        const updated = await get('updated');
        expect(
            updated.body
                .replace(/^\uFEFF/, '')
                .trim()
                .split('\n')
        ).toEqual(['Id,Old Id,ParentId', 'U1,003C,001X', 'U2,003D,001Y']);
        expect((await get('gibtsnicht')).statusCode).toBe(400);
    });

    it('liefert alle gesendeten Felder einer Fehlerzeile', async () => {
        const ok = await app.inject({
            method: 'GET',
            url: `/api/results/error-record?folder=020_Contact&id=${id}&index=0`,
            headers
        });
        expect(ok.json()).toEqual({
            fields: { Id: 'F1', 'Old Id': '003A', Email: 'a@b.de' }
        });
        const none = await app.inject({
            method: 'GET',
            url: `/api/results/error-record?folder=020_Contact&id=${id}&index=5`,
            headers
        });
        expect(none.statusCode).toBe(404);
    });

    it('antwortet 404 bei unbekanntem Lauf und lehnt Pfadtricks ab', async () => {
        const unknown = await app.inject({
            method: 'GET',
            url: '/api/results/run?folder=020_Contact&id=nix',
            headers
        });
        expect(unknown.statusCode).toBe(404);
        const evil = await app.inject({
            method: 'GET',
            url: '/api/results/run?folder=020_Contact&id=..%2F..',
            headers
        });
        expect(evil.statusCode).toBe(404);
    });
});

describe('Query-Routen', () => {
    it('liefert das Query-Modell und speichert Filter', async () => {
        const model = await app.inject({
            method: 'GET',
            url: '/api/query?folder=020_Contact',
            headers
        });
        expect(model.json()).toMatchObject({ object: 'Contact', supported: true, parents: [] });

        const saved = await app.inject({
            method: 'POST',
            url: '/api/query/filters',
            headers,
            payload: {
                folder: '020_Contact',
                filters: [{ field: 'Phone', op: '!=', value: { kind: 'null' } }]
            }
        });
        expect(saved.statusCode).toBe(200);
        expect(saved.json().filters).toEqual([
            { field: 'Phone', op: '!=', value: { kind: 'null' } }
        ]);
    });

    it('lehnt ungültige Filter und Parent-Wechsel am Zielobjekt ab', async () => {
        const bad = await app.inject({
            method: 'POST',
            url: '/api/query/filters',
            headers,
            payload: {
                folder: '020_Contact',
                filters: [{ field: 'x y', op: '=', value: { kind: 'null' } }]
            }
        });
        expect(bad.statusCode).toBe(400);
        const parent = await app.inject({
            method: 'POST',
            url: '/api/query/parent',
            headers,
            payload: { folder: '020_Contact', index: 0, mode: 'read' }
        });
        expect(parent.statusCode).toBe(400);
        expect(parent.json().error).toMatch(/Unbekannter/);
    });
});

describe('Kohorten-Routen', () => {
    it('liefert eine leere Liste und lehnt ungültige Anfragen ab', async () => {
        const list = await app.inject({ method: 'GET', url: '/api/cohorts', headers });
        expect(list.json()).toEqual({ cohorts: [] });

        const bad = await app.inject({
            method: 'POST',
            url: '/api/cohorts',
            headers,
            payload: { name: 'x', rule: { kind: 'sample', size: 99999 } }
        });
        expect(bad.statusCode).toBe(400);

        const unknown = await app.inject({
            method: 'GET',
            url: '/api/cohorts/preview?id=nix',
            headers
        });
        expect(unknown.statusCode).toBe(404);
        const del = await app.inject({
            method: 'POST',
            url: '/api/cohorts/delete',
            headers,
            payload: { id: '..' }
        });
        expect(del.statusCode).toBe(404);
    });
});

describe('Cleaner-Routen', () => {
    it('lehnt Pläne ohne gewählte Objekte ab und braucht ausgewählte Orgs', async () => {
        const empty = await app.inject({
            method: 'POST',
            url: '/api/tools/cleaner/plan',
            headers,
            payload: { objects: [], scope: { creator: 'me' } }
        });
        expect(empty.statusCode).toBe(400);
        const bad = await app.inject({
            method: 'POST',
            url: '/api/tools/cleaner/plan',
            headers,
            payload: { objects: ['Account; DROP'], scope: { creator: 'me' } }
        });
        expect(bad.statusCode).toBe(400);
        const badDate = await app.inject({
            method: 'POST',
            url: '/api/tools/cleaner/plan',
            headers,
            payload: { objects: ['Account'], scope: { creator: 'me', since: 'gestern' } }
        });
        expect(badDate.statusCode).toBe(400);
    });

    it('meldet den Status und verlangt beim Start die Bestätigung', async () => {
        const status = await app.inject({
            method: 'GET',
            url: '/api/tools/cleaner/status',
            headers
        });
        expect(status.json()).toEqual({ running: false });
        const noConfirm = await app.inject({
            method: 'POST',
            url: '/api/tools/cleaner/start',
            headers,
            payload: { objects: ['Account'], scope: { creator: 'me' } }
        });
        expect(noConfirm.statusCode).toBe(400); // confirm fehlt
    });
});

describe('Cleaner zurücksetzen', () => {
    it('setzt ohne laufenden Auftrag zurück', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/tools/cleaner/reset', headers });
        expect(res.statusCode).toBe(204);
    });
});

describe('Versionen-Routen', () => {
    it('speichert einen Stand, vergleicht, lädt mit Backup und löscht', async () => {
        const save = await app.inject({
            method: 'POST',
            url: '/api/presets',
            headers,
            payload: { folder: '020_Contact', name: 'Erster Stand', note: 'läuft' }
        });
        expect(save.statusCode).toBe(200);
        const first = save.json();
        expect(first).toMatchObject({
            name: 'Erster Stand',
            source: 'manual',
            matchesCurrent: true
        });

        // Konfiguration ändern, dann den ersten Stand vergleichen und laden
        await app.inject({
            method: 'POST',
            url: '/api/exclude',
            headers,
            payload: { folder: '020_Contact', field: 'Phone', excluded: true }
        });
        const diff = await app.inject({
            method: 'GET',
            url: `/api/presets/diff?folder=020_Contact&id=${first.id}`,
            headers
        });
        expect(diff.json().changes.map((c: { text: string }) => c.text)).toContain(
            'Contact (Hauptobjekt): wieder aufgenommen: Phone'
        );

        const restore = await app.inject({
            method: 'POST',
            url: '/api/presets/restore',
            headers,
            payload: { folder: '020_Contact', id: first.id, backupName: 'Vor dem Laden' }
        });
        expect(restore.statusCode).toBe(200);
        expect(restore.json().backup).toMatchObject({ name: 'Vor dem Laden', source: 'backup' });

        const list = await app.inject({
            method: 'GET',
            url: '/api/presets?folder=020_Contact',
            headers
        });
        const presets = list.json().presets as {
            id: string;
            matchesCurrent: boolean;
            source: string;
        }[];
        expect(presets).toHaveLength(2);
        expect(presets.find((p) => p.id === first.id)?.matchesCurrent).toBe(true);

        for (const p of presets) {
            const del = await app.inject({
                method: 'POST',
                url: '/api/presets/delete',
                headers,
                payload: { folder: '020_Contact', id: p.id }
            });
            expect(del.statusCode).toBe(204);
        }
    });

    it('lehnt unbekannte Stände, fehlenden Namen und Pfadtricks ab', async () => {
        const noName = await app.inject({
            method: 'POST',
            url: '/api/presets',
            headers,
            payload: { folder: '020_Contact', name: '  ' }
        });
        expect(noName.statusCode).toBe(400);
        const unknown = await app.inject({
            method: 'POST',
            url: '/api/presets/restore',
            headers,
            payload: { folder: '020_Contact', id: 'gibt-es-nicht' }
        });
        expect(unknown.statusCode).toBe(404);
        const evil = await app.inject({
            method: 'POST',
            url: '/api/presets/delete',
            headers,
            payload: { folder: '020_Contact', id: '..' }
        });
        expect(evil.statusCode).toBe(404);
    });
});

describe('Mapping-Datei aus dem Finder', () => {
    async function xlsx(sheet: string) {
        const book = new ExcelJS.Workbook();
        const ws = book.addWorksheet(sheet);
        ws.addRow(['Source', 'Source', 'Source', 'Source', 'Target', 'Target', 'Target', 'Target']);
        ws.addRow([
            'Object',
            'Field',
            'Value',
            'API Value',
            'Object',
            'Field',
            'Value',
            'API Value'
        ]);
        ws.addRow(['Account', 'Type', 'Melume', 'Melume', 'Account', 'Type', 'Andere', 'Other']);
        return Buffer.from(await book.xlsx.writeBuffer());
    }
    const upload = (name: string, payload: Buffer, replace = false) =>
        app.inject({
            method: 'POST',
            url: `/api/valuemapping/upload?name=${encodeURIComponent(name)}${replace ? '&replace=1' : ''}`,
            headers: { ...headers, 'content-type': 'application/octet-stream' },
            payload
        });

    it('legt die Datei in Mappings/ ab, wählt sie und fragt bei gleichem Namen nach', async () => {
        const res = await upload('Andreas Feedback.xlsx', await xlsx('Picklist Mapping'));
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            selected: 'Mappings/Andreas Feedback.xlsx',
            files: [{ file: 'Mappings/Andreas Feedback.xlsx', usable: true }]
        });

        const again = await upload('Andreas Feedback.xlsx', await xlsx('Picklist Mapping'));
        expect(again.statusCode).toBe(409);
        const replaced = await upload(
            'Andreas Feedback.xlsx',
            await xlsx('Picklist Mapping'),
            true
        );
        expect(replaced.statusCode).toBe(200);
    });

    it('lehnt Dateien ohne Blatt, Nicht-Excel und Pfadtricks ab', async () => {
        expect((await upload('ohne.xlsx', await xlsx('Anderes'))).json().error).toMatch(
            /kein Blatt/
        );
        expect((await upload('kaputt.xlsx', Buffer.from('kein zip'))).statusCode).toBe(400);
        expect(
            (await upload('../../evil.xlsx', await xlsx('Picklist Mapping'))).json()
        ).toMatchObject({
            selected: 'Mappings/evil.xlsx' // nur der Dateiname zählt, die Datei landet in Mappings/
        });
        expect((await upload('notiz.txt', Buffer.from('x'))).statusCode).toBe(400);
        expect((await upload('~$lock.xlsx', await xlsx('Picklist Mapping'))).statusCode).toBe(400);
    });

    it('weist ungültige Anfragen für feste Werte mit 400 ab', async () => {
        const post = (payload: Record<string, unknown>) =>
            app.inject({ method: 'POST', url: '/api/static', headers, payload });
        expect((await post({})).statusCode).toBe(400);
        const bad = { folder: '020_Contact', value: 'USD' };
        expect((await post({ ...bad, targetField: 'a b' })).statusCode).toBe(400);
        expect((await post({ ...bad, targetField: 'X', value: 'x'.repeat(256) })).statusCode).toBe(
            400
        );
    });
});
