import type { ErrorRow, MissingParentGroup, MissingParentRow, RecordRow } from '@studio/shared';
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

const labelOf = (row: Record<string, string>) => {
    const column = LABEL_COLUMNS.find((c) => !isEmpty(row[c]));
    return column ? (row[column] ?? '') : '';
};

// Die Quell-Id steht je nach Objekt in "Old Id" oder im Trace-Feld (zum Beispiel AccountCrossOrgTraceID__c).
const sourceIdOf = (row: Record<string, string>) => {
    if (!isEmpty(row['Old Id'])) return row['Old Id'] ?? '';
    const trace = Object.keys(row).find((k) => /CrossOrgTraceID__c$/.test(k));
    return trace && !isEmpty(row[trace]) ? (row[trace] ?? '') : '';
};

export interface TargetTables {
    rows: number;
    errors: ErrorRow[];
    // Erfolgreiche Zeilen (ohne Text in "Errors") samt allen Spalten, in Dateireihenfolge.
    records: { row: RecordRow; fields: Record<string, string> }[];
    // Alle Spalten der fehlgeschlagenen Zeilen (das, was an die Ziel-Org gesendet wurde), gleiche Reihenfolge wie errors.
    errorRecords: Record<string, string>[];
}

// Datensätze, die SFDMU schreibt; Zeilen mit Text in "Errors" gelten als fehlgeschlagen.
export function readTargetTable(fileName: string, text: string): TargetTables {
    const table = readTable(text);
    const errors: ErrorRow[] = [];
    const errorRecords: Record<string, string>[] = [];
    const records: TargetTables['records'] = [];
    for (const row of table) {
        if (isEmpty(row.Errors)) {
            records.push({
                row: {
                    file: operationOf(fileName),
                    id: row.Id ?? '',
                    oldId: sourceIdOf(row),
                    label: labelOf(row)
                },
                fields: row
            });
            continue;
        }
        errorRecords.push(row);
        errors.push({
            file: operationOf(fileName),
            id: row.Id ?? '',
            oldId: row['Old Id'] ?? '',
            label: labelOf(row),
            error: row.Errors ?? ''
        });
    }
    return { rows: table.length, errors, errorRecords, records };
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
