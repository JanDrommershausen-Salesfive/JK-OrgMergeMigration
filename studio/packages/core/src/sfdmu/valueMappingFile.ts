import { writeFileAtomic } from '../util/fs';
import { parseCsv, toCsv } from './csv';
import { readValueMappingCsv, valueMappingPath } from './exportConfig';

// Zeilen eines Objekts aus der ValueMapping.csv eines Objektordners (ohne Kopfzeile).
export async function rowsOfObject(
    sfdmuDir: string,
    folder: string,
    object: string
): Promise<string[][]> {
    const [, ...body] = parseCsv(await readValueMappingCsv(sfdmuDir, folder));
    return body.filter((r) => r[0] === object);
}

// Ersetzt alle Zeilen eines Objekts in der ValueMapping.csv eines Objektordners; andere Objekte bleiben.
// Liefert true, wenn es danach Zeilen für das Objekt gibt.
export async function setObjectRows(
    sfdmuDir: string,
    folder: string,
    object: string,
    rows: string[][]
): Promise<boolean> {
    const original = await readValueMappingCsv(sfdmuDir, folder);
    const [header = [], ...body] = parseCsv(original);
    const out = [...body.filter((r) => r[0] !== object), ...rows];
    const text = toCsv([header, ...out], true);
    if (text !== original) await writeFileAtomic(valueMappingPath(sfdmuDir, folder), text);
    return rows.length > 0;
}
