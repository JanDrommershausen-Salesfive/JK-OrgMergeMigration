import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DescribeResult } from '@studio/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { setFieldExcluded, setFieldMapping, setValueMapping } from './mutations';
import { objectDetail } from './objects';

const exportJson = {
    objects: [
        { query: 'SELECT Id, Name FROM Account', operation: 'Readonly', externalId: 'Name' },
        {
            query: 'SELECT Id, FirstName, Email, AccountId, Phone FROM Contact',
            operation: 'Upsert',
            externalId: 'Email'
        }
    ]
};
const csv = 'ObjectName,FieldName,RawValue,Value\nAccount,BillingCountry,USA,United States\n';
const targetDescribe: DescribeResult = {
    ok: true,
    fields: {
        Phone: {
            type: 'phone',
            baseType: 'phone',
            label: 'Phone',
            createable: true,
            updateable: true
        },
        Mobile__c: {
            type: 'phone',
            baseType: 'phone',
            label: 'M',
            createable: true,
            updateable: true
        },
        Locked__c: {
            type: 'phone',
            baseType: 'phone',
            label: 'L',
            createable: false,
            updateable: false
        }
    }
};

let dir: string;
const file = (...p: string[]) => path.join(dir, ...p);
const detail = () => objectDetail(dir, '020_Contact', {});
const readExport = async () =>
    JSON.parse(await readFile(file('020_Contact', 'export.json'), 'utf8'));

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sfdmu-'));
    await mkdir(file('020_Contact'));
    await writeFile(file('020_Contact', 'export.json'), JSON.stringify(exportJson));
    await writeFile(file('020_Contact', 'ValueMapping.csv'), csv);
});

describe('setFieldMapping', () => {
    it('setzt ein Mapping und aktiviert useFieldMapping', async () => {
        await setFieldMapping(
            dir,
            await detail(),
            { sourceField: 'Phone', targetField: 'Mobile__c' },
            targetDescribe
        );
        const obj = (await readExport()).objects[1];
        expect(obj.fieldMapping).toEqual([{ sourceField: 'Phone', targetField: 'Mobile__c' }]);
        expect(obj.useFieldMapping).toBe(true);
        expect((await detail()).fields.find((f) => f.name === 'Phone')?.renamed).toBe(true);
    });

    it('entfernt das Mapping, wenn Ziel gleich Quelle ist', async () => {
        const req = { sourceField: 'Phone', targetField: 'Mobile__c' };
        await setFieldMapping(dir, await detail(), req, targetDescribe);
        await setFieldMapping(
            dir,
            await detail(),
            { sourceField: 'Phone', targetField: 'Phone' },
            targetDescribe
        );
        const obj = (await readExport()).objects[1];
        expect(obj.fieldMapping).toBeUndefined();
        expect(obj.useFieldMapping).toBeUndefined();
    });

    it('lehnt External-ID, nicht schreibbare und fehlende Zielfelder ab', async () => {
        const d = await detail();
        await expect(
            setFieldMapping(dir, d, { sourceField: 'Email', targetField: 'X' }, targetDescribe)
        ).rejects.toThrow(/External-ID/);
        await expect(
            setFieldMapping(
                dir,
                d,
                { sourceField: 'Phone', targetField: 'Locked__c' },
                targetDescribe
            )
        ).rejects.toThrow(/nicht schreibbar/);
        await expect(
            setFieldMapping(
                dir,
                d,
                { sourceField: 'Phone', targetField: 'Gibts__c' },
                targetDescribe
            )
        ).rejects.toThrow(/existiert im Ziel nicht/);
    });

    it('lehnt ein bereits belegtes Zielfeld ab', async () => {
        await expect(
            setFieldMapping(
                dir,
                await detail(),
                { sourceField: 'Phone', targetField: 'FirstName' },
                { ok: false, error: 'egal' }
            )
        ).rejects.toThrow(/bereits von FirstName/);
    });
});

describe('setFieldExcluded', () => {
    it('schließt ein Feld aus und nimmt es wieder auf', async () => {
        await setFieldExcluded(dir, await detail(), { field: 'Phone', excluded: true });
        expect((await readExport()).objects[1].excludedFields).toEqual(['Phone']);
        await setFieldExcluded(dir, await detail(), { field: 'Phone', excluded: false });
        expect((await readExport()).objects[1].excludedFields).toBeUndefined();
    });

    it('verwirft beim Ausschluss ein bestehendes Mapping', async () => {
        await setFieldMapping(
            dir,
            await detail(),
            { sourceField: 'Phone', targetField: 'Mobile__c' },
            targetDescribe
        );
        await setFieldExcluded(dir, await detail(), { field: 'Phone', excluded: true });
        expect((await readExport()).objects[1].fieldMapping).toBeUndefined();
    });

    it('schützt Id und External-ID', async () => {
        const d = await detail();
        await expect(setFieldExcluded(dir, d, { field: 'Id', excluded: true })).rejects.toThrow();
        await expect(
            setFieldExcluded(dir, d, { field: 'Email', excluded: true })
        ).rejects.toThrow();
    });
});

describe('setValueMapping', () => {
    it('ergänzt Zeilen in der Datei des Ordners, lässt andere Objekte darin unberührt und aktiviert useValuesMapping', async () => {
        await setValueMapping(dir, await detail(), {
            field: 'MailingCountry',
            rows: [{ from: 'USA', to: 'United States' }]
        });
        const text = await readFile(file('020_Contact', 'ValueMapping.csv'), 'utf8');
        expect(text).toContain('Account,BillingCountry,USA,United States');
        expect(text).toContain('Contact,MailingCountry,USA,United States');
        expect((await readExport()).objects[1].useValuesMapping).toBe(true);
    });

    it('entfernt useValuesMapping, wenn keine Zeilen mehr übrig sind', async () => {
        await setValueMapping(dir, await detail(), {
            field: 'MailingCountry',
            rows: [{ from: 'USA', to: 'United States' }]
        });
        await setValueMapping(dir, await detail(), { field: 'MailingCountry', rows: [] });
        expect((await readExport()).objects[1].useValuesMapping).toBeUndefined();
    });

    it('lehnt doppelte Quellwerte ab', async () => {
        await expect(
            setValueMapping(dir, await detail(), {
                field: 'MailingCountry',
                rows: [
                    { from: 'USA', to: 'a' },
                    { from: 'USA', to: 'b' }
                ]
            })
        ).rejects.toThrow(/doppelt/);
    });
});

describe('Parent-Einträge', () => {
    const parentConfig = {
        objects: [
            {
                query: 'SELECT Id, Name, Industry FROM Account',
                operation: 'Upsert',
                master: false,
                externalId: 'Name'
            },
            { query: 'SELECT Id, Email FROM Contact', operation: 'Upsert', externalId: 'Email' }
        ]
    };

    beforeEach(async () => {
        await writeFile(file('020_Contact', 'export.json'), JSON.stringify(parentConfig));
    });

    it('liefert das Detail eines Parent-Eintrags mit eigenen Feldern', async () => {
        const d = await objectDetail(dir, '020_Contact', {}, 0);
        expect(d).toMatchObject({
            object: 'Account',
            parentIndex: 0,
            operation: 'Upsert',
            externalId: 'Name',
            lastRun: null
        });
        expect(d.fields.map((f) => f.name)).toEqual(['Id', 'Name', 'Industry']);
        expect((await objectDetail(dir, '020_Contact', {})).parentIndex).toBeNull();
        await expect(objectDetail(dir, '020_Contact', {}, 1)).rejects.toThrow(/Unbekannter Parent/);
    });

    it('schreibt Mapping und Ausschluss in den Parent-Eintrag, nicht ins Zielobjekt', async () => {
        const accountTarget: DescribeResult = {
            ok: true,
            fields: {
                Industry: {
                    type: 'x',
                    baseType: 'string',
                    label: 'x',
                    createable: true,
                    updateable: true
                },
                Branche__c: {
                    type: 'x',
                    baseType: 'string',
                    label: 'x',
                    createable: true,
                    updateable: true
                }
            }
        };
        await setFieldMapping(
            dir,
            await objectDetail(dir, '020_Contact', {}, 0),
            { sourceField: 'Industry', targetField: 'Branche__c' },
            accountTarget
        );
        let cfg = await readExport();
        expect(cfg.objects[0].fieldMapping).toEqual([
            { sourceField: 'Industry', targetField: 'Branche__c' }
        ]);
        expect(cfg.objects[1].fieldMapping).toBeUndefined();

        await setFieldExcluded(dir, await objectDetail(dir, '020_Contact', {}, 0), {
            field: 'Industry',
            excluded: true
        });
        cfg = await readExport();
        expect(cfg.objects[0].excludedFields).toEqual(['Industry']);
        expect(cfg.objects[0].fieldMapping).toBeUndefined();
    });
});
