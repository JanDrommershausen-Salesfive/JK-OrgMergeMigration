import type { ErrorRow, MissingParentGroup, MissingParentRow } from '@studio/shared';
import { parseCsv } from '../sfdmu/csv';

// CSV mit Kopfzeile als Liste von Objekten; SFDMU schreibt ein BOM an den Dateianfang.
export function readTable(text: string): Record<string, string>[] {
    const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
    if (!header) return [];
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const isEmpty = (v: string | undefined) => !v || v === '#N/A';
const LABEL_COLUMNS = ['Name', 'Subject', 'Email', 'LastName', 'FirstName', 'ProductCode', 'Title'];

// <Objekt>_<operation>_target.csv: Operation steht im Dateinamen.
export const operationOf = (fileName: string) =>
    fileName.match(/^\w+?_(\w+)_target\.csv$/)?.[1] ?? fileName;

export interface TargetTables {
    rows: number;
    errors: ErrorRow[];
}

// Datensätze, die SFDMU schreibt; Zeilen mit Text in "Errors" gelten als fehlgeschlagen.
export function readTargetTable(fileName: string, text: string): TargetTables {
    const table = readTable(text);
    const errors: ErrorRow[] = [];
    for (const row of table) {
        if (isEmpty(row.Errors)) continue;
        const labelColumn = LABEL_COLUMNS.find((c) => !isEmpty(row[c]));
        errors.push({
            file: operationOf(fileName),
            id: row.Id ?? '',
            oldId: row['Old Id'] ?? '',
            label: labelColumn ? (row[labelColumn] ?? '') : '',
            error: row.Errors ?? ''
        });
    }
    return { rows: table.length, errors };
}

// MissingParentRecordsReport.csv: SFDMU wiederholt Zeilen je Durchlauf, hier dedupliziert.
export function readMissingParents(text: string): {
    rows: MissingParentRow[];
    groups: MissingParentGroup[];
} {
    const seen = new Set<string>();
    const rows: MissingParentRow[] = [];
    for (const r of readTable(text)) {
        const row: MissingParentRow = {
            lookupField: r['Lookup field name'] ?? '',
            parentObject: r['Parent SObject name'] ?? '',
            value: r['Missing parent External Id value'] ?? '',
            recordId: r['Record Id'] ?? '',
            object: r['sObject name'] ?? ''
        };
        const key = [row.lookupField, row.parentObject, row.value, row.recordId].join('\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
    }
    const groups = new Map<string, MissingParentGroup>();
    for (const r of rows) {
        const key = [r.lookupField, r.parentObject, r.value].join('\u0000');
        const g = groups.get(key);
        if (g) g.records++;
        else
            groups.set(key, {
                lookupField: r.lookupField,
                parentObject: r.parentObject,
                value: r.value,
                records: 1
            });
    }
    return { rows, groups: [...groups.values()].sort((a, b) => b.records - a.records) };
}
