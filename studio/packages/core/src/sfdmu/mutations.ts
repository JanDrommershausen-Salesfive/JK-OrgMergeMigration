import type {
    DescribeResult,
    ExcludeRequest,
    MappingRequest,
    ObjectDetail,
    ValueMappingRequest
} from '@studio/shared';
import { badRequest, conflict } from '../errors';
import { writeFileAtomic } from '../util/fs';
import { parseCsv, toCsv } from './csv';
import { readValueMappingCsv, updateEntry, valueMappingPath } from './exportConfig';

const FIELD_NAME = /^\w+$/;

// Ändern von Feld-Mapping, Ausschlüssen und Wertemapping. Jede Funktion prüft die Regeln
// gegen den aktuellen Stand (detail) und schreibt danach genau eine Datei atomar.

export async function setFieldMapping(
    sfdmuDir: string,
    detail: ObjectDetail,
    { sourceField, targetField }: Pick<MappingRequest, 'sourceField' | 'targetField'>,
    targetDescribe: DescribeResult
): Promise<void> {
    const field = detail.fields.find((f) => f.name === sourceField);
    if (!field) throw badRequest(`Feld ${sourceField} steht nicht in der Query.`);
    if (!FIELD_NAME.test(targetField)) throw badRequest('Ungültiger Zielfeld-Name.');
    if (field.externalId) {
        throw badRequest(
            'External-ID-Felder können hier nicht umgemappt werden (die Readonly-Parents in anderen Ordnern würden abweichen).'
        );
    }
    if (sourceField === 'Id') throw badRequest('Id kann nicht umgemappt werden.');
    if (field.excluded) {
        throw badRequest(
            `${sourceField} ist von der Migration ausgeschlossen. Erst wieder aufnehmen.`
        );
    }
    const clash = detail.fields.find(
        (f) => f.name !== sourceField && !f.excluded && f.targetField === targetField
    );
    if (clash) throw conflict(`Zielfeld ${targetField} wird bereits von ${clash.name} befüllt.`);

    if (targetField !== sourceField && targetDescribe.ok) {
        const tf = targetDescribe.fields[targetField];
        if (!tf) throw badRequest(`Zielfeld ${targetField} existiert im Ziel nicht.`);
        if (!tf.createable)
            throw badRequest(`Zielfeld ${targetField} ist im Ziel nicht schreibbar.`);
    }

    await updateEntry(sfdmuDir, detail.folder, detail.parentIndex ?? undefined, (obj) => {
        const mappings = (obj.fieldMapping ?? []).filter((m) => m.sourceField !== sourceField);
        if (targetField !== sourceField) mappings.push({ sourceField, targetField });
        if (mappings.length) {
            obj.fieldMapping = mappings;
            obj.useFieldMapping = true;
        } else {
            delete obj.fieldMapping;
            delete obj.useFieldMapping;
        }
    });
}

// Nimmt ein Feld über SFDMUs excludedFields aus der Migration oder wieder hinein. Es bleibt in der Query.
export async function setFieldExcluded(
    sfdmuDir: string,
    detail: ObjectDetail,
    { field: name, excluded }: Pick<ExcludeRequest, 'field' | 'excluded'>
): Promise<void> {
    const field = detail.fields.find((f) => f.name === name);
    if (!field) throw badRequest(`Feld ${name} steht nicht in der Query.`);
    if (name === 'Id' || field.externalId) {
        throw badRequest('Id und External-ID-Felder können nicht ausgeschlossen werden.');
    }
    if (!excluded) {
        const clash = detail.fields.find(
            (f) => f.name !== name && !f.excluded && f.targetField === field.targetField
        );
        if (clash) {
            throw conflict(
                `Zielfeld ${field.targetField} wird inzwischen von ${clash.name} befüllt. Erst dort das Mapping ändern.`
            );
        }
    }

    await updateEntry(sfdmuDir, detail.folder, detail.parentIndex ?? undefined, (obj) => {
        const set = new Set(obj.excludedFields ?? []);
        if (excluded) {
            set.add(name);
            // Ein ausgeschlossenes Feld darf keine Umbenennung behalten, die das Zielfeld für andere blockiert.
            const mappings = (obj.fieldMapping ?? []).filter((m) => m.sourceField !== name);
            if (mappings.length) obj.fieldMapping = mappings;
            else {
                delete obj.fieldMapping;
                delete obj.useFieldMapping;
            }
        } else set.delete(name);
        if (set.size) obj.excludedFields = [...set];
        else delete obj.excludedFields;
    });
}

// Ersetzt alle Zeilen eines Objekts und Felds in der ValueMapping.csv dieses Objektordners.
// Zeilen anderer Objekte (mitgezogene Parents) bleiben unverändert.
export async function setValueMapping(
    sfdmuDir: string,
    detail: ObjectDetail,
    { field, rows }: Pick<ValueMappingRequest, 'field' | 'rows'>
): Promise<void> {
    if (!FIELD_NAME.test(field)) throw badRequest('Ungültiger Feldname.');
    if (rows.length > 500) throw badRequest('Ungültige Zeilen.');
    const clean: { from: string; to: string }[] = [];
    for (const r of rows) {
        if (r.from.length > 255 || r.to.length > 255) throw badRequest('Ungültige Werte.');
        if (r.from.trim() === '') continue; // Zeilen ohne Quellwert werden nicht gespeichert
        if (clean.some((c) => c.from === r.from)) {
            throw conflict(`Quellwert „${r.from}“ kommt doppelt vor.`);
        }
        clean.push(r);
    }

    const original = await readValueMappingCsv(sfdmuDir, detail.folder);
    const [header = [], ...body] = parseCsv(original);
    const newRows = clean.map((r) => [detail.object, field, r.from, r.to]);
    const out: string[][] = [];
    let inserted = false;
    for (const r of body) {
        if (r[0] === detail.object && r[1] === field) {
            if (!inserted) {
                out.push(...newRows);
                inserted = true;
            }
            continue;
        }
        out.push(r);
    }
    if (!inserted) out.push(...newRows);
    const text = toCsv([header, ...out], /\n$/.test(original));
    if (text !== original) await writeFileAtomic(valueMappingPath(sfdmuDir, detail.folder), text);

    // SFDMU wendet ValueMapping.csv nur auf Objekte an, die per useValuesMapping zustimmen.
    const anyForObject = out.some((r) => r[0] === detail.object);
    await updateEntry(sfdmuDir, detail.folder, detail.parentIndex ?? undefined, (obj) => {
        if (anyForObject === !!obj.useValuesMapping) return;
        if (anyForObject) obj.useValuesMapping = true;
        else delete obj.useValuesMapping;
    });
}
