import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
            '"Id","Old Id","Email","Errors"\n"F1","003A","a@b.de","Pflichtfeld fehlt"\n'
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
            errors: [{ error: 'Pflichtfeld fehlt' }]
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
