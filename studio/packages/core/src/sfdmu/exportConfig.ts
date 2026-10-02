import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from '../errors';
import { readJson, writeFileAtomic } from '../util/fs';

export interface ExportObject {
    query: string;
    operation: string;
    externalId?: string;
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

export const readValueMappingCsv = (sfdmuDir: string) =>
    readFile(path.join(sfdmuDir, 'ValueMapping.csv'), 'utf8');
