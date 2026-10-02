import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from '../errors';
import { readJson, writeFileAtomic } from '../util/fs';

export interface ExportObject {
    query: string;
    operation: string;
    externalId?: string;
    master?: boolean;
    useValuesMapping?: boolean;
    useFieldMapping?: boolean;
    fieldMapping?: { sourceField: string; targetField: string; targetObject?: string }[];
    excludedFields?: string[];
    [key: string]: unknown;
}

export interface ExportConfig {
    objects: ExportObject[];
    [key: string]: unknown;
}

export const objectOf = (o: ExportObject): string => o.query.match(/FROM\s+(\w+)/)?.[1] ?? '';

export function listFolders(sfdmuDir: string): string[] {
    if (!existsSync(sfdmuDir)) return [];
    return readdirSync(sfdmuDir)
        .filter((d) => /^\d+_/.test(d) && existsSync(path.join(sfdmuDir, d, 'export.json')))
        .sort();
}

const exportFile = (sfdmuDir: string, folder: string) => path.join(sfdmuDir, folder, 'export.json');

export async function readExport(sfdmuDir: string, folder: string): Promise<ExportConfig> {
    if (!listFolders(sfdmuDir).includes(folder)) throw notFound('Unbekannter Ordner.');
    return readJson<ExportConfig>(exportFile(sfdmuDir, folder));
}

// Das zu migrierende Objekt steht in export.json zuletzt; davor stehen die Readonly-Parents.
export function targetObject(config: ExportConfig): ExportObject {
    const last = config.objects[config.objects.length - 1];
    if (!last) throw new Error('export.json enthält keine Objekte.');
    return last;
}

// Ändert das Zielobjekt in export.json und schreibt die Datei atomar zurück.
export async function updateTargetObject(
    sfdmuDir: string,
    folder: string,
    change: (obj: ExportObject) => void
): Promise<void> {
    const config = await readExport(sfdmuDir, folder);
    change(targetObject(config));
    await writeFileAtomic(exportFile(sfdmuDir, folder), JSON.stringify(config, null, 2) + '\n');
}

// Ändert einen Eintrag der export.json: das Zielobjekt oder (mit parentIndex) einen Parent-Eintrag.
export async function updateEntry(
    sfdmuDir: string,
    folder: string,
    parentIndex: number | undefined,
    change: (obj: ExportObject) => void
): Promise<void> {
    await updateExport(sfdmuDir, folder, (config) => {
        const entry = entryOf(config, parentIndex);
        change(entry);
    });
}

// Zielobjekt oder Parent-Eintrag; Parent-Einträge stehen vor dem Zielobjekt.
export function entryOf(config: ExportConfig, parentIndex: number | undefined): ExportObject {
    if (parentIndex === undefined) return targetObject(config);
    const entry = config.objects.slice(0, -1)[parentIndex];
    if (!entry) throw notFound('Unbekannter Parent-Eintrag.');
    return entry;
}

// Ändert die ganze export.json (Zielobjekt und Parent-Einträge) und schreibt sie atomar zurück.
export async function updateExport(
    sfdmuDir: string,
    folder: string,
    change: (config: ExportConfig) => void
): Promise<void> {
    const config = await readExport(sfdmuDir, folder);
    change(config);
    await writeFileAtomic(exportFile(sfdmuDir, folder), JSON.stringify(config, null, 2) + '\n');
}

// Wertemapping liegt pro Objektordner (<Ordner>/ValueMapping.csv), SFDMU liest die Datei im Lauf-Ordner.
export const VALUE_MAPPING_HEADER = 'ObjectName,FieldName,RawValue,Value\n';
export const valueMappingPath = (sfdmuDir: string, folder: string) =>
    path.join(sfdmuDir, folder, 'ValueMapping.csv');

// Fehlt die Datei (noch kein Wertemapping), gilt eine leere Datei mit Kopfzeile.
export async function readValueMappingCsv(sfdmuDir: string, folder: string): Promise<string> {
    try {
        return await readFile(valueMappingPath(sfdmuDir, folder), 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return VALUE_MAPPING_HEADER;
        throw err;
    }
}
