import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

const port = 4174;
const headers = { host: `127.0.0.1:${port}` };
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'proj-'));
    const sfdmu = path.join(dir, 'sfdmu');
    await mkdir(path.join(sfdmu, '020_Contact'), { recursive: true });
    await writeFile(
        path.join(sfdmu, 'run.sh'),
        'SOURCE_ALIAS="a"\nTARGET_ALIAS="b"\nEXPECTED_SOURCE_ID="00D1"\nEXPECTED_TARGET_ID="00D2"\nPROD_ORG_IDS=("00D1")\n'
    );
    await writeFile(path.join(sfdmu, 'ValueMapping.csv'), 'ObjectName,FieldName,RawValue,Value\n');
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
