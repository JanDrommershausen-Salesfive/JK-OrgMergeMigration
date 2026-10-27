import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DescribedField } from '@studio/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
    listMappingFiles,
    loadPicklistMapping,
    selectMappingFile,
    selectedMappingFile
} from './mappingFile';
import { CLEAR_VALUE, planValueMappings, resolveField } from './plan';

const f = (baseType: string, label: string): DescribedField => ({
    type: baseType,
    baseType,
    label,
    createable: true,
    updateable: true
});
const source: Record<string, DescribedField> = {
    Type: f('picklist', 'Account Type'),
    Industry: f('picklist', 'Industry'),
    Tax_Status__c: f('picklist', 'Tax Status'),
    Name: f('string', 'Account Name'),
    A__c: f('picklist', 'Twice'),
    B__c: f('picklist', 'Twice')
};
const row = (
    sourceField: string,
    sourceValue: string,
    targetValue: string,
    sourceObject = 'Account'
) => ({
    sourceObject,
    sourceField,
    sourceValue,
    targetValue
});

describe('resolveField', () => {
    it('findet Felder über den API-Namen oder ein eindeutiges Label', () => {
        expect(resolveField('type', source)).toBe('Type');
        expect(resolveField('Tax Status', source)).toBe('Tax_Status__c');
        expect(resolveField('Twice', source)).toBeNull();
        expect(resolveField('Unbekannt', source)).toBeNull();
    });
});

describe('planValueMappings', () => {
    const base = {
        object: 'Account',
        fields: ['Type', 'Industry', 'Tax_Status__c', 'Name'],
        source,
        existing: [{ field: 'Type', from: 'Prospect', to: 'Prospect' }]
    };

    it('übernimmt nur Picklist-Felder der Query und Werte, die die CSV noch nicht kennt', () => {
        const { added, conflicts } = planValueMappings({
            ...base,
            rows: [
                row('Type', 'Prospect', 'Prospect'),
                row('Type', 'Distributor', 'Reseller'),
                row('Tax Status', 'Exempt All', 'Exempt All'),
                row('Account Name', 'x', 'y'), // kein Picklist-Feld
                row('Rating', 'Hot', 'Hot'), // nicht in der Query
                row('Type', 'Won', 'closedwon', 'Potential Client') // anderes Objekt
            ]
        });
        expect(added).toEqual([
            { field: 'Type', from: 'Distributor', to: 'Reseller' },
            { field: 'Tax_Status__c', from: 'Exempt All', to: 'Exempt All' }
        ]);
        expect(conflicts).toEqual([]);
    });

    it('setzt #N/A, wenn das Excel keinen Zielwert nennt', () => {
        const { added } = planValueMappings({ ...base, rows: [row('Industry', 'Others', '')] });
        expect(added).toEqual([{ field: 'Industry', from: 'Others', to: CLEAR_VALUE }]);
    });

    it('überschreibt vorhandene Zeilen nicht, meldet aber Abweichungen', () => {
        const { added, conflicts } = planValueMappings({
            ...base,
            rows: [
                row('Type', 'Prospect', 'Customer'),
                row('Type', 'Melume', 'Other'),
                row('Type', 'Melume', 'X')
            ]
        });
        expect(added).toEqual([{ field: 'Type', from: 'Melume', to: 'Other' }]);
        expect(conflicts).toEqual([
            { field: 'Type', from: 'Prospect', csv: 'Prospect', file: 'Customer' }
        ]);
    });
});

async function workbook(file: string, sheetName: string, rows: (string | null)[][]) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(sheetName);
    rows.forEach((r) => sheet.addRow(r));
    await book.xlsx.writeFile(file);
}

describe('Mapping-Datei', () => {
    const header = [
        ['Source', 'Source', 'Source', 'Source ', 'Target', 'Target', 'Target', 'Target ', 'Notes'],
        ['Object', 'Field', 'Value', 'API Value', 'Object', 'Field', 'Value', 'API Value', null]
    ];

    async function project() {
        const dir = await mkdtemp(path.join(tmpdir(), 'valuemap-'));
        const mappings = path.join(dir, 'Mappings');
        await mkdir(mappings);
        await workbook(path.join(mappings, 'old.xlsx'), 'Picklist Mapping', [
            ...header,
            ['Intro-Zeile ohne Werte', null, null, null, null, null, null, null, null],
            ['Account ', 'Industry ', 'Others', 'Others', null, null, null, null, 'leave blank'],
            [
                'Account',
                'Type',
                'Customer, Active',
                'Customer, Active',
                'Account',
                'Account Type',
                'Kunde',
                'Customer',
                null
            ]
        ]);
        await workbook(path.join(mappings, 'new.xlsx'), 'Picklist Mapping', [
            ...header,
            [
                'Account',
                'Type',
                'Melume',
                'Melume',
                'Account',
                'Account Type',
                'Andere',
                'Other',
                null
            ]
        ]);
        await workbook(path.join(mappings, 'newest-other.xlsx'), 'Anderes Blatt', [['x']]);
        await writeFile(path.join(mappings, '~$old.xlsx'), 'lock');
        const t = Date.now() / 1000;
        await utimes(path.join(mappings, 'old.xlsx'), t - 300, t - 300);
        await utimes(path.join(mappings, 'new.xlsx'), t - 200, t - 200);
        await utimes(path.join(mappings, 'newest-other.xlsx'), t - 100, t - 100);
        return dir;
    }

    it('listet die Excel-Dateien neueste zuerst, ohne Sperrdateien, und markiert unbrauchbare', async () => {
        const files = await listMappingFiles(await project());
        expect(files.map((f) => [f.file, f.usable])).toEqual([
            ['Mappings/newest-other.xlsx', false],
            ['Mappings/new.xlsx', true],
            ['Mappings/old.xlsx', true]
        ]);
        expect(files[0]?.problem).toMatch(/kein Blatt/);
    });

    it('übernimmt nichts, solange keine Datei gewählt ist, auch nicht die neueste', async () => {
        const dir = await project();
        expect(await selectedMappingFile(dir)).toBeNull();
        expect(await loadPicklistMapping(dir)).toBeNull();
    });

    it('liest die gewählte Datei, auch wenn es eine neuere gibt', async () => {
        const dir = await project();
        await selectMappingFile(dir, 'Mappings/old.xlsx');
        expect(await readFile(path.join(dir, 'mapping.config.json'), 'utf8')).toContain(
            '"picklistFile": "Mappings/old.xlsx"'
        );
        const result = await loadPicklistMapping(dir);
        expect(result?.file).toBe('Mappings/old.xlsx');
        expect(result?.rows).toEqual([
            {
                sourceObject: 'Account',
                sourceField: 'Industry',
                sourceValue: 'Others',
                targetValue: ''
            },
            {
                sourceObject: 'Account',
                sourceField: 'Type',
                sourceValue: 'Customer, Active',
                targetValue: 'Customer'
            }
        ]);
        await selectMappingFile(dir, null);
        expect(await loadPicklistMapping(dir)).toBeNull();
    });

    it('lehnt Dateien außerhalb von Mappings/ und ohne Blatt ab', async () => {
        const dir = await project();
        await expect(selectMappingFile(dir, '../secret.xlsx')).rejects.toThrow(/nicht in Mappings/);
        await expect(selectMappingFile(dir, 'Mappings/newest-other.xlsx')).rejects.toThrow(
            /kein Blatt/
        );
    });

    it('meldet eine gewählte Datei, die inzwischen fehlt', async () => {
        const dir = await project();
        await selectMappingFile(dir, 'Mappings/new.xlsx');
        await rm(path.join(dir, 'Mappings', 'new.xlsx'));
        await expect(loadPicklistMapping(dir)).rejects.toThrow(/fehlt/);
    });

    it('liefert eine leere Liste ohne Mappings-Ordner', async () => {
        expect(await listMappingFiles(await mkdtemp(path.join(tmpdir(), 'valuemap-')))).toEqual([]);
    });
});
