import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { writeFileAtomic } from '../util/fs';

export const MAPPING_DIR = 'Mappings';
export const PICKLIST_SHEET = 'Picklist Mapping';

// Eine Zeile des Blatts "Picklist Mapping": Quelle (US) → Ziel (EU).
export interface PicklistMappingRow {
    sourceObject: string;
    sourceField: string; // API-Name (Standardfelder) oder Label (Custom-Felder), so wie im Excel
    sourceValue: string; // API-Wert der Quelle
    targetValue: string; // API-Wert des Ziels; leer: Ziel bleibt leer
}

export interface PicklistMapping {
    file: string; // relativ zum Projekt
    rows: PicklistMappingRow[];
}

// Excel setzt geschützte Leerzeichen (NBSP) in viele Zellen.
const clean = (v: string | undefined) => (v ?? '').replace(/\u00a0/g, ' ').trim();

// Spalten A–D Quelle (Object, Field, Value, API Value), E–H Ziel, I Notizen. Die Kopfzeile mit
// "Field" in B und "API Value" in D steht in den ersten Zeilen, darüber die Gruppenzeile Source/Target.
export function parsePicklistSheet(sheet: ExcelJS.Worksheet): PicklistMappingRow[] {
    const cell = (row: ExcelJS.Row, col: number) => clean(row.getCell(col).text);
    let header = 0;
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
        const row = sheet.getRow(r);
        if (cell(row, 2) === 'Field' && cell(row, 4) === 'API Value') {
            header = r;
            break;
        }
    }
    if (!header) {
        throw new Error(`Blatt „${PICKLIST_SHEET}“: Kopfzeile (Field … API Value) nicht gefunden.`);
    }
    const rows: PicklistMappingRow[] = [];
    for (let r = header + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const sourceObject = cell(row, 1);
        const sourceField = cell(row, 2);
        const sourceValue = cell(row, 4) || cell(row, 3);
        if (!sourceObject || !sourceField || !sourceValue) continue; // Zwischenüberschriften, Nur-Ziel-Werte
        rows.push({
            sourceObject,
            sourceField,
            sourceValue,
            targetValue: cell(row, 8) || cell(row, 7)
        });
    }
    return rows;
}

const cache = new Map<string, { mtimeMs: number; rows: PicklistMappingRow[] | null }>();

async function readSheet(file: string, mtimeMs: number): Promise<PicklistMappingRow[] | null> {
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.rows;
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const sheet = book.getWorksheet(PICKLIST_SHEET);
    const rows = sheet ? parsePicklistSheet(sheet) : null;
    cache.set(file, { mtimeMs, rows });
    return rows;
}

// Die gewählte Mapping-Datei steht in mapping.config.json (versioniert, gilt für alle im Team).
export const MAPPING_CONFIG = 'mapping.config.json';

export interface MappingFileInfo {
    file: string; // relativ zum Projekt, zum Beispiel Mappings/x.xlsx
    modified: string;
    usable: boolean; // hat ein lesbares Blatt "Picklist Mapping"
    problem?: string;
}

// .xlsx in Mappings/, neueste zuerst. Excel-Sperrdateien (~$…) zählen nicht.
export async function listMappingFiles(projectDir: string): Promise<MappingFileInfo[]> {
    const dir = path.join(projectDir, MAPPING_DIR);
    let names: string[];
    try {
        names = await readdir(dir);
    } catch {
        return [];
    }
    const files = await Promise.all(
        names
            .filter((n) => n.toLowerCase().endsWith('.xlsx') && !n.startsWith('~$'))
            .map(async (n) => {
                const { mtimeMs, mtime } = await stat(path.join(dir, n));
                const info = {
                    file: path.posix.join(MAPPING_DIR, n),
                    modified: mtime.toISOString()
                };
                try {
                    const rows = await readSheet(path.join(dir, n), mtimeMs);
                    return rows
                        ? { ...info, usable: true, mtimeMs }
                        : {
                              ...info,
                              usable: false,
                              problem: `kein Blatt „${PICKLIST_SHEET}“`,
                              mtimeMs
                          };
                } catch (e) {
                    return { ...info, usable: false, problem: (e as Error).message, mtimeMs };
                }
            })
    );
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files.map((f) => ({
        file: f.file,
        modified: f.modified,
        usable: f.usable,
        ...('problem' in f ? { problem: f.problem } : {})
    }));
}

export async function selectedMappingFile(projectDir: string): Promise<string | null> {
    try {
        const raw = JSON.parse(await readFile(path.join(projectDir, MAPPING_CONFIG), 'utf8')) as {
            picklistFile?: unknown;
        };
        return typeof raw.picklistFile === 'string' && raw.picklistFile ? raw.picklistFile : null;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error(`${MAPPING_CONFIG} ist ungültig: ${(e as Error).message}`);
    }
}

// Nur Dateien aus der Liste sind wählbar, und nur mit lesbarem Blatt. null hebt die Wahl auf.
export async function selectMappingFile(projectDir: string, file: string | null): Promise<void> {
    if (file !== null) {
        const info = (await listMappingFiles(projectDir)).find((f) => f.file === file);
        if (!info) throw new Error(`${file} liegt nicht in ${MAPPING_DIR}/.`);
        if (!info.usable) throw new Error(`${file}: ${info.problem}`);
    }
    await writeFileAtomic(
        path.join(projectDir, MAPPING_CONFIG),
        JSON.stringify(file === null ? {} : { picklistFile: file }, null, 2) + '\n'
    );
}

// Zeilen der gewählten Mapping-Datei; null, wenn keine gewählt ist.
export async function loadPicklistMapping(projectDir: string): Promise<PicklistMapping | null> {
    const file = await selectedMappingFile(projectDir);
    if (!file) return null;
    const full = path.join(projectDir, file);
    if (path.relative(path.join(projectDir, MAPPING_DIR), full).startsWith('..')) {
        throw new Error(`${MAPPING_CONFIG}: ${file} liegt nicht in ${MAPPING_DIR}/.`);
    }
    let mtimeMs: number;
    try {
        mtimeMs = (await stat(full)).mtimeMs;
    } catch {
        throw new Error(`Gewählte Mapping-Datei ${file} fehlt.`);
    }
    const rows = await readSheet(full, mtimeMs);
    if (!rows) throw new Error(`${file} hat kein Blatt „${PICKLIST_SHEET}“.`);
    return { file, rows };
}

export class MappingFileExistsError extends Error {}

// Legt eine im Finder gewählte Datei in Mappings/ ab. Sie muss ein lesbares Blatt "Picklist Mapping"
// haben. Eine gleichnamige Datei wird nur mit replace überschrieben. Liefert den Pfad relativ zum Projekt.
export async function saveMappingFile(
    projectDir: string,
    name: string,
    data: Uint8Array,
    replace: boolean
): Promise<string> {
    const base = path.basename(name.replace(/\\/g, '/')).trim();
    if (!/^[^~$/.][^/]{0,150}\.xlsx$/i.test(base)) {
        throw new Error('Nur .xlsx-Dateien (keine Excel-Sperrdateien) lassen sich ablegen.');
    }
    const book = new ExcelJS.Workbook();
    try {
        await book.xlsx.load(data as unknown as ArrayBuffer);
    } catch {
        throw new Error(`${base} ist keine lesbare Excel-Datei.`);
    }
    const sheet = book.getWorksheet(PICKLIST_SHEET);
    if (!sheet) throw new Error(`${base} hat kein Blatt „${PICKLIST_SHEET}“.`);
    parsePicklistSheet(sheet); // wirft, wenn die Kopfzeile fehlt

    const dir = path.join(projectDir, MAPPING_DIR);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, base);
    const exists = await stat(target).then(
        () => true,
        () => false
    );
    if (exists && !replace)
        throw new MappingFileExistsError(`${base} liegt schon in ${MAPPING_DIR}/.`);
    await writeFileAtomic(target, data);
    return path.posix.join(MAPPING_DIR, base);
}
