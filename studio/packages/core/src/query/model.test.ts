import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DescribeResult } from '@studio/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { changeFields, queryModel, saveFilters, setParentMode } from './model';

const account = {
    objects: [
        {
            query: 'SELECT Id, Name, BillingCountry, Industry FROM Account WHERE CreatedDate = LAST_N_DAYS:7',
            operation: 'Upsert',
            externalId: 'Name',
            useValuesMapping: true,
            fieldMapping: [{ sourceField: 'Industry', targetField: 'Branche__c' }],
            useFieldMapping: true,
            excludedFields: ['BillingCountry']
        }
    ]
};
const contact = {
    objects: [
        {
            query: 'SELECT Id, Name FROM Account WHERE CreatedDate = LAST_N_DAYS:7',
            operation: 'Readonly',
            externalId: 'Name'
        },
        {
            query: 'SELECT Id, Email, AccountId FROM Contact WHERE CreatedDate = LAST_N_DAYS:7',
            operation: 'Upsert',
            externalId: 'Email'
        }
    ]
};
const field = (createable = true) => ({
    type: 'string(80)',
    baseType: 'string',
    label: 'x',
    createable,
    updateable: true
});
const source: DescribeResult = {
    ok: true,
    fields: { Phone: field(), Fax: field(), Gone: field() }
};

let dir: string;
const readCfg = async (folder: string) =>
    JSON.parse(await readFile(path.join(dir, folder, 'export.json'), 'utf8'));

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'qry-'));
    for (const [folder, cfg] of [
        ['010_Account', account],
        ['020_Contact', contact]
    ] as const) {
        await mkdir(path.join(dir, folder));
        await writeFile(path.join(dir, folder, 'export.json'), JSON.stringify(cfg));
    }
});

describe('queryModel', () => {
    it('liest Felder, Filter und Parent-Einträge', async () => {
        const m = await queryModel(dir, '020_Contact');
        expect(m).toMatchObject({
            object: 'Contact',
            fields: ['Id', 'Email', 'AccountId'],
            supported: true,
            filters: [{ field: 'CreatedDate', op: '=' }]
        });
        expect(m.parents).toEqual([
            {
                index: 0,
                object: 'Account',
                operation: 'Readonly',
                master: true,
                externalId: 'Name',
                where: 'CreatedDate = LAST_N_DAYS:7',
                fields: ['Id', 'Name'],
                mode: 'custom',
                configFolder: '010_Account'
            }
        ]);
    });
});

describe('saveFilters', () => {
    it('ersetzt die Filterzeilen und lässt Felder unberührt', async () => {
        await saveFilters(dir, '020_Contact', {
            filters: [
                {
                    field: 'Country',
                    op: 'IN',
                    value: { kind: 'list', values: [{ kind: 'string', value: 'DE' }] }
                }
            ]
        });
        expect((await readCfg('020_Contact')).objects[1].query).toBe(
            "SELECT Id, Email, AccountId FROM Contact WHERE Country IN ('DE')"
        );
    });

    it('entfernt den Filter bei leerer Liste und speichert Rohtext', async () => {
        await saveFilters(dir, '020_Contact', { filters: [] });
        expect((await readCfg('020_Contact')).objects[1].query).toBe(
            'SELECT Id, Email, AccountId FROM Contact'
        );
        await saveFilters(dir, '020_Contact', { rawWhere: "A = 1 OR B = 'x'" });
        const m = await queryModel(dir, '020_Contact');
        expect(m.filters).toBeNull();
        expect(m.rawWhere).toBe("A = 1 OR B = 'x'");
    });

    it('lehnt gefährliche Texte und ungültige Feldnamen ab', async () => {
        await expect(saveFilters(dir, '020_Contact', { rawWhere: 'A = 1; B' })).rejects.toThrow();
        await expect(
            saveFilters(dir, '020_Contact', {
                filters: [{ field: 'A b', op: '=', value: { kind: 'null' } }]
            })
        ).rejects.toThrow(/Ungültig/);
    });
});

describe('changeFields', () => {
    it('hängt in der Quelle lesbare Felder an (auch ohne Gegenstück im Ziel) und nimmt Felder heraus', async () => {
        await changeFields(
            dir,
            '020_Contact',
            { add: ['Phone', 'Gone'], remove: ['AccountId'] },
            source
        );
        expect((await readCfg('020_Contact')).objects[1].query).toContain(
            'SELECT Id, Email, Phone, Gone FROM Contact'
        );
    });

    it('lehnt Felder ab, die die Quelle nicht kennt; doppelte werden ignoriert', async () => {
        await expect(
            changeFields(dir, '020_Contact', { add: ['Nix'], remove: [] }, source)
        ).rejects.toThrow(/Quelle nicht/);
        await changeFields(dir, '020_Contact', { add: ['Email'], remove: [] }, source);
        expect((await readCfg('020_Contact')).objects[1].query).toContain(
            'SELECT Id, Email, AccountId FROM'
        );
    });

    it('lässt Id und External ID in der Query', async () => {
        await expect(
            changeFields(dir, '020_Contact', { add: [], remove: ['Id'] }, source)
        ).rejects.toThrow(/Abgleich/);
        await expect(
            changeFields(dir, '020_Contact', { add: [], remove: ['Email'] }, source)
        ).rejects.toThrow(/Abgleich/);
    });

    it('entfernt beim Abwählen auch Mapping und Ausschluss des Feldes', async () => {
        const cfg = await readCfg('020_Contact');
        cfg.objects[1].fieldMapping = [{ sourceField: 'AccountId', targetField: 'Konto__c' }];
        cfg.objects[1].useFieldMapping = true;
        cfg.objects[1].excludedFields = ['AccountId'];
        await writeFile(path.join(dir, '020_Contact', 'export.json'), JSON.stringify(cfg));
        await changeFields(dir, '020_Contact', { add: [], remove: ['AccountId'] }, source);
        const obj = (await readCfg('020_Contact')).objects[1];
        expect(obj.fieldMapping).toBeUndefined();
        expect(obj.useFieldMapping).toBeUndefined();
        expect(obj.excludedFields).toBeUndefined();
    });

    it('wirkt mit parentIndex nur auf mitgezogene Parents', async () => {
        await expect(
            changeFields(dir, '020_Contact', { add: ['Phone'], remove: [], parentIndex: 0 }, source)
        ).rejects.toThrow(/mitgezogene/);
        await setParentMode(dir, '020_Contact', 0, 'pull');
        const acc = {
            ok: true as const,
            fields: { Industry: field(), Rating: field(), Name: field() }
        };
        await changeFields(
            dir,
            '020_Contact',
            { add: ['Rating'], remove: ['BillingCountry'], parentIndex: 0 },
            acc
        );
        const parent = (await readCfg('020_Contact')).objects[0];
        expect(parent.query).toBe('SELECT Id, Name, Industry, Rating FROM Account');
        expect(parent.excludedFields).toBeUndefined();
        expect((await readCfg('010_Account')).objects[0].query).toContain('BillingCountry');
    });
});

describe('Wertemapping beim Umschalten des Parent-Modus', () => {
    const vm = (dir_: string, folder: string) => path.join(dir_, folder, 'ValueMapping.csv');
    const accountRows =
        'ObjectName,FieldName,RawValue,Value\nAccount,BillingCountry,USA,United States\n';

    it('pull kopiert die Wertemapping-Zeilen des Parents in den Ordner, read entfernt sie wieder', async () => {
        await writeFile(vm(dir, '010_Account'), accountRows);
        await setParentMode(dir, '020_Contact', 0, 'pull');
        expect(await readFile(vm(dir, '020_Contact'), 'utf8')).toContain(
            'Account,BillingCountry,USA,United States'
        );
        expect((await readCfg('020_Contact')).objects[0].useValuesMapping).toBe(true);
        // Der eigene Ordner des Parents bleibt unverändert
        expect(await readFile(vm(dir, '010_Account'), 'utf8')).toBe(accountRows);

        await setParentMode(dir, '020_Contact', 0, 'read');
        expect(await readFile(vm(dir, '020_Contact'), 'utf8')).not.toContain('Account,');
        expect((await readCfg('020_Contact')).objects[0].useValuesMapping).toBeUndefined();
    });

    it('pull ohne Wertemapping des Parents setzt kein useValuesMapping', async () => {
        const cfg = await readCfg('010_Account');
        delete cfg.objects[0].useValuesMapping;
        await writeFile(path.join(dir, '010_Account', 'export.json'), JSON.stringify(cfg));
        await setParentMode(dir, '020_Contact', 0, 'pull');
        expect((await readCfg('020_Contact')).objects[0].useValuesMapping).toBeUndefined();
    });
});

describe('setParentMode', () => {
    it('read: Readonly, master:false, nur Id und External ID, kein Filter', async () => {
        await setParentMode(dir, '020_Contact', 0, 'read');
        expect((await readCfg('020_Contact')).objects[0]).toEqual({
            query: 'SELECT Id, Name FROM Account',
            operation: 'Readonly',
            master: false,
            externalId: 'Name'
        });
        expect((await queryModel(dir, '020_Contact')).parents[0]?.mode).toBe('read');
    });

    it('pull: übernimmt Felder, Mapping und Ausschlüsse des Parent-Objekts ohne dessen Filter', async () => {
        await writeFile(
            path.join(dir, '010_Account', 'ValueMapping.csv'),
            'ObjectName,FieldName,RawValue,Value\nAccount,BillingCountry,USA,United States\n'
        );
        await setParentMode(dir, '020_Contact', 0, 'pull');
        const parent = (await readCfg('020_Contact')).objects[0];
        expect(parent).toMatchObject({
            query: 'SELECT Id, Name, BillingCountry, Industry FROM Account',
            operation: 'Upsert',
            master: false,
            externalId: 'Name',
            useValuesMapping: true,
            useFieldMapping: true,
            excludedFields: ['BillingCountry'],
            fieldMapping: [{ sourceField: 'Industry', targetField: 'Branche__c' }]
        });
        expect((await queryModel(dir, '020_Contact')).parents[0]?.mode).toBe('pull');
    });

    it('pull ohne eigene Konfiguration des Parents wird abgelehnt', async () => {
        await writeFile(
            path.join(dir, '020_Contact', 'export.json'),
            JSON.stringify({
                objects: [
                    {
                        query: 'SELECT Id, Name FROM Pricebook2',
                        operation: 'Readonly',
                        externalId: 'Name'
                    },
                    contact.objects[1]
                ]
            })
        );
        await expect(setParentMode(dir, '020_Contact', 0, 'pull')).rejects.toThrow(
            /keine eigene Konfiguration/
        );
    });

    it('lehnt einen unbekannten Eintrag ab und das Zielobjekt selbst', async () => {
        await expect(setParentMode(dir, '020_Contact', 1, 'read')).rejects.toThrow(/Unbekannter/);
    });
});
