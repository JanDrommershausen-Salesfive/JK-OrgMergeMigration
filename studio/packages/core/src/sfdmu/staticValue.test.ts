import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DescribedField, DescribeResult } from '@studio/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { setFieldExcluded, setFieldMapping } from './mutations';
import { objectDetail } from './objects';
import { checkStaticValue, pickCarrier, setStaticValue, staticValuesOf } from './staticValue';

const f = (baseType: string, over: Partial<DescribedField> = {}): DescribedField => ({
    type: baseType,
    baseType,
    label: baseType,
    createable: true,
    updateable: true,
    ...over
});
const source: DescribeResult = {
    ok: true,
    fields: {
        Id: f('id', { createable: false }),
        Name: f('string'),
        Phone: f('phone'),
        Zeta__c: f('string'), // gibt es auch im Ziel
        Ava_Only__c: f('string'), // nur in der Quelle: bester Träger
        Locked__c: f('string', { createable: false })
    }
};
const target: DescribeResult = {
    ok: true,
    fields: {
        Id: f('id', { createable: false }),
        Name: f('string'),
        Phone: f('phone'),
        Zeta__c: f('string'),
        CurrencyIsoCode: f('picklist', { picklistValues: ['EUR', 'USD'] }),
        Locked__c: f('string', { createable: false })
    }
};

let dir: string;
const file = (...p: string[]) => path.join(dir, ...p);
const detail = (parentIndex?: number) => objectDetail(dir, '010_Account', {}, parentIndex);
const readExport = async () =>
    JSON.parse(await readFile(file('010_Account', 'export.json'), 'utf8'));

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sfdmu-'));
    await mkdir(file('010_Account'));
    await writeFile(
        file('010_Account', 'export.json'),
        JSON.stringify({
            objects: [
                { query: 'SELECT Id, Name FROM Pricebook2', operation: 'Readonly' },
                {
                    query: "SELECT Id, Name, Phone FROM Account WHERE Id IN ('001')",
                    operation: 'Upsert',
                    externalId: 'Id'
                }
            ]
        })
    );
});

describe('checkStaticValue', () => {
    it('lässt harmlose Werte durch und kürzt Leerraum', () => {
        expect(checkStaticValue(' USD ')).toBe('USD');
        expect(checkStaticValue('Kunde & Partner, Nr. 5')).toBe('Kunde & Partner, Nr. 5');
        expect(checkStaticValue('Müller-Lüdenscheid')).toBe('Müller-Lüdenscheid');
    });

    it('lehnt Zeichen ab, die SFDMUs eval-Ausdruck verändern könnten', () => {
        for (const bad of [
            "a'b",
            "'); process.exit(); ('",
            'a(b)',
            'a\\b',
            'a`b',
            '$x',
            'a\nb',
            '',
            '  '
        ]) {
            expect(() => checkStaticValue(bad), JSON.stringify(bad)).toThrow(/Ungültiger Wert/);
        }
        expect(() => checkStaticValue('x RAW_VALUE x')).toThrow(/Ungültiger Wert/);
        expect(() => checkStaticValue('a'.repeat(256))).toThrow(/Ungültiger Wert/);
    });
});

describe('pickCarrier', () => {
    it('nimmt zuerst beschreibbare Textfelder, die es im Ziel nicht gibt', () => {
        const s = source.ok ? source.fields : {};
        const t = target.ok ? target.fields : {};
        expect(pickCarrier(s, t, new Set(['name']))).toBe('Ava_Only__c');
        // Ist das schon belegt, weicht er auf ein Feld aus, das es auch im Ziel gibt
        expect(pickCarrier(s, t, new Set(['name', 'ava_only__c']))).toBe('Zeta__c');
        // Ohne lesbares Ziel zählt nur der Name
        expect(pickCarrier(s, null, new Set(['name']))).toBe('Ava_Only__c');
        expect(pickCarrier(s, t, new Set(['name', 'ava_only__c', 'zeta__c']))).toBeNull();
    });
});

describe('setStaticValue', () => {
    it('schreibt Query, Mapping und Mock und erkennt den Träger wieder', async () => {
        await setStaticValue(
            dir,
            await detail(),
            { targetField: 'CurrencyIsoCode', value: 'USD' },
            source,
            target
        );
        const obj = (await readExport()).objects[1];
        expect(obj.query).toBe(
            "SELECT Id, Name, Phone, Ava_Only__c FROM Account WHERE Id IN ('001')"
        );
        expect(obj.fieldMapping).toEqual([
            { sourceField: 'Ava_Only__c', targetField: 'CurrencyIsoCode' }
        ]);
        expect(obj.useFieldMapping).toBe(true);
        expect(obj.mockFields).toEqual([{ name: 'Ava_Only__c', pattern: "c_set_value('USD')" }]);
        expect(obj.updateWithMockData).toBe(true);
        expect(staticValuesOf(obj).get('Ava_Only__c')).toEqual({
            target: 'CurrencyIsoCode',
            value: 'USD'
        });
        const carrier = (await detail()).fields.find((x) => x.name === 'Ava_Only__c');
        expect(carrier).toMatchObject({ staticValue: 'USD', targetField: 'CurrencyIsoCode' });
        expect(
            (await detail()).fields.find((x) => x.name === 'Phone')?.staticValue
        ).toBeUndefined();
    });

    it('ändert einen vorhandenen Wert, ohne einen zweiten Träger anzulegen', async () => {
        const req = { targetField: 'CurrencyIsoCode' };
        await setStaticValue(dir, await detail(), { ...req, value: 'USD' }, source, target);
        await setStaticValue(dir, await detail(), { ...req, value: 'EUR' }, source, target);
        const obj = (await readExport()).objects[1];
        expect(obj.mockFields).toEqual([{ name: 'Ava_Only__c', pattern: "c_set_value('EUR')" }]);
        expect(obj.fieldMapping).toHaveLength(1);
        expect(obj.query.match(/Ava_Only__c/g)).toHaveLength(1);
    });

    it('entfernt alles wieder, auch die Schalter, wenn nichts anderes übrig ist', async () => {
        const original = await readExport();
        const req = { targetField: 'CurrencyIsoCode' };
        await setStaticValue(dir, await detail(), { ...req, value: 'USD' }, source, target);
        await setStaticValue(dir, await detail(), { ...req, value: null }, source, target);
        expect(await readExport()).toEqual(original);
        // Entfernen ohne vorhandenen Wert ist nichts Besonderes
        await setStaticValue(dir, await detail(), { ...req, value: null }, source, target);
        expect(await readExport()).toEqual(original);
    });

    it('lässt Mappings und Mocks anderer Felder beim Entfernen stehen', async () => {
        await setFieldMapping(
            dir,
            await detail(),
            { sourceField: 'Phone', targetField: 'Zeta__c' },
            target
        );
        const req = { targetField: 'CurrencyIsoCode' };
        await setStaticValue(dir, await detail(), { ...req, value: 'USD' }, source, target);
        await setStaticValue(dir, await detail(), { ...req, value: null }, source, target);
        const obj = (await readExport()).objects[1];
        expect(obj.fieldMapping).toEqual([{ sourceField: 'Phone', targetField: 'Zeta__c' }]);
        expect(obj.useFieldMapping).toBe(true);
        expect(obj.mockFields).toBeUndefined();
    });

    it('lehnt unbekannte, nicht schreibbare und schon belegte Zielfelder ab', async () => {
        const d = await detail();
        const set = (targetField: string, t: DescribeResult = target) =>
            setStaticValue(dir, d, { targetField, value: 'x' }, source, t);
        await expect(set('Gibts__c')).rejects.toThrow(/existiert im Ziel nicht/);
        await expect(set('Locked__c')).rejects.toThrow(/nicht schreibbar/);
        await expect(set('Phone')).rejects.toThrow(/wird bereits von Phone befüllt/);
        await expect(set('CurrencyIsoCode', { ok: false, error: 'x' })).rejects.toThrow(
            /Ziel muss lesbar sein/
        );
        await expect(
            setStaticValue(dir, d, { targetField: 'CurrencyIsoCode', value: "a'b" }, source, target)
        ).rejects.toThrow(/Ungültiger Wert/);
    });

    it('meldet, wenn kein Träger übrig ist, und ändert die Datei dann nicht', async () => {
        const original = await readExport();
        const small: DescribeResult = { ok: true, fields: { Id: f('id'), Name: f('string') } };
        await expect(
            setStaticValue(
                dir,
                await detail(),
                { targetField: 'CurrencyIsoCode', value: 'USD' },
                small,
                target
            )
        ).rejects.toThrow(/kein freies Textfeld/);
        expect(await readExport()).toEqual(original);
    });

    it('lehnt Readonly-Einträge ab', async () => {
        await expect(
            setStaticValue(
                dir,
                await detail(0),
                { targetField: 'CurrencyIsoCode', value: 'USD' },
                source,
                target
            )
        ).rejects.toThrow(/Readonly/);
    });

    it('sperrt den Träger gegen Umhängen und Ausschließen und belegt das Zielfeld', async () => {
        await setStaticValue(
            dir,
            await detail(),
            { targetField: 'CurrencyIsoCode', value: 'USD' },
            source,
            target
        );
        const d = await detail();
        await expect(
            setFieldMapping(dir, d, { sourceField: 'Ava_Only__c', targetField: 'Zeta__c' }, target)
        ).rejects.toThrow(/trägt einen festen Wert/);
        await expect(
            setFieldExcluded(dir, d, { field: 'Ava_Only__c', excluded: true })
        ).rejects.toThrow(/trägt einen festen Wert/);
        // Ein anderes Quellfeld kann das Zielfeld nicht mehr beanspruchen
        await expect(
            setFieldMapping(
                dir,
                d,
                { sourceField: 'Phone', targetField: 'CurrencyIsoCode' },
                target
            )
        ).rejects.toThrow(/bereits von Ava_Only__c befüllt/);
    });
});
