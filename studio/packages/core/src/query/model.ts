import type { DescribeResult, ParentEntry, QueryModel } from '@studio/shared';
import { badRequest, conflict } from '../errors';
import {
    listFolders,
    objectOf,
    readExport,
    targetObject,
    updateExport,
    type ExportObject
} from '../sfdmu/exportConfig';
import { rowsOfObject, setObjectRows } from '../sfdmu/valueMappingFile';
import { buildSoql, parseSoql, validateRawWhere, whereText } from './soql';
import { isOrGroup, type FilterNode } from '@studio/shared';

const FIELD = /^[A-Za-z_][\w.]*$/;

// Welcher Objektordner konfiguriert dieses Objekt als Zielobjekt (zum Beispiel 010_Account für Account)?
async function folderOfObject(
    sfdmuDir: string,
    folder: string,
    object: string
): Promise<string | null> {
    for (const f of listFolders(sfdmuDir)) {
        if (f === folder) continue;
        const cfg = await readExport(sfdmuDir, f);
        if (objectOf(targetObject(cfg)) === object) return f;
    }
    return null;
}

function parentMode(o: ExportObject): ParentEntry['mode'] {
    if (o.master !== false) return 'custom';
    if (o.operation === 'Readonly') return 'read';
    if (o.operation === 'Upsert' || o.operation === 'Insert') return 'pull';
    return 'custom';
}

export async function queryModel(sfdmuDir: string, folder: string): Promise<QueryModel> {
    const config = await readExport(sfdmuDir, folder);
    const target = targetObject(config);
    const parsed = parseSoql(target.query);
    const parents: ParentEntry[] = [];
    for (const [index, o] of config.objects.slice(0, -1).entries()) {
        const p = parseSoql(o.query);
        parents.push({
            index,
            object: objectOf(o),
            operation: o.operation,
            master: o.master !== false,
            externalId: o.externalId ?? null,
            where: whereText(p) || null,
            fields: p.fields,
            mode: parentMode(o),
            configFolder: await folderOfObject(sfdmuDir, folder, objectOf(o))
        });
    }
    return {
        folder,
        object: parsed.object,
        soql: target.query,
        fields: parsed.fields,
        filters: parsed.filters,
        rawWhere: parsed.rawWhere,
        tail: parsed.tail,
        supported: parsed.supported,
        parents
    };
}

function assertSupported(supported: boolean) {
    if (!supported) {
        throw conflict(
            'Diese Query enthält Unterabfragen oder Funktionen und kann hier nicht bearbeitet werden.'
        );
    }
}

// WHERE-Bedingungen ersetzen: entweder als Zeilen oder als Text (Experten-Modus).
export async function saveFilters(
    sfdmuDir: string,
    folder: string,
    change: { filters?: FilterNode[]; rawWhere?: string }
): Promise<void> {
    const parsed = parseSoql(targetObject(await readExport(sfdmuDir, folder)).query);
    assertSupported(parsed.supported);
    let filters: FilterNode[] | null = change.filters ?? null;
    let rawWhere: string | null = null;
    if (change.filters === undefined) {
        const text = (change.rawWhere ?? '').trim();
        const problem = validateRawWhere(text);
        if (problem) throw badRequest(problem);
        if (text) rawWhere = text;
        else filters = [];
    }
    for (const node of filters ?? []) {
        for (const f of isOrGroup(node) ? node.or : [node]) {
            if (!FIELD.test(f.field)) throw badRequest(`Ungültiger Feldname: ${f.field}`);
        }
    }
    const query = buildSoql({ ...parsed, filters, rawWhere });
    await updateExport(sfdmuDir, folder, (cfg) => {
        targetObject(cfg).query = query;
    });
}

// Felder an- oder abwählen. Hinzu kommen nur Felder, die die Quelle liefern kann; ob und wohin sie im Ziel
// passen, klärt das Mapping.
// Beim Abwählen verschwinden auch Mapping und Ausschluss dieses Feldes im selben Eintrag.
// Mit parentIndex gilt die Änderung für einen mitgezogenen Parent, sonst für das Zielobjekt.
export async function changeFields(
    sfdmuDir: string,
    folder: string,
    change: { add: string[]; remove: string[]; parentIndex?: number },
    source: DescribeResult
): Promise<void> {
    const config = await readExport(sfdmuDir, folder);
    const entry =
        change.parentIndex === undefined
            ? targetObject(config)
            : config.objects.slice(0, -1)[change.parentIndex];
    if (!entry) throw badRequest('Unbekannter Parent-Eintrag.');
    if (
        change.parentIndex !== undefined &&
        (entry.operation === 'Readonly' || entry.master !== false)
    ) {
        throw conflict('Felder lassen sich nur für mitgezogene Parents wählen.');
    }
    const parsed = parseSoql(entry.query);
    assertSupported(parsed.supported);

    const keep = new Set((entry.externalId ?? '').split(';').filter(Boolean).concat('Id'));
    for (const f of change.remove) {
        if (keep.has(f))
            throw badRequest(`${f} wird zum Abgleich gebraucht und bleibt in der Query.`);
    }
    const add = change.add.filter(
        (f) => !parsed.fields.some((x) => x.toLowerCase() === f.toLowerCase())
    );
    if (add.length) {
        if (!source.ok) throw conflict('Die Quelle muss lesbar sein, um Felder zu prüfen.');
        for (const f of add) {
            if (!source.fields[f]) throw badRequest(`${f} existiert in der Quelle nicht.`);
        }
    }
    const removed = new Set(change.remove.map((f) => f.toLowerCase()));
    const fields = [...parsed.fields.filter((f) => !removed.has(f.toLowerCase())), ...add];
    if (fields.length === parsed.fields.length && !add.length && !removed.size) return;
    const query = buildSoql({ ...parsed, fields });

    await updateExport(sfdmuDir, folder, (cfg) => {
        const obj =
            change.parentIndex === undefined
                ? targetObject(cfg)
                : (cfg.objects[change.parentIndex] as ExportObject);
        obj.query = query;
        if (removed.size) {
            const mappings = (obj.fieldMapping ?? []).filter(
                (m) => !removed.has(m.sourceField.toLowerCase())
            );
            if (mappings.length) obj.fieldMapping = mappings;
            else {
                delete obj.fieldMapping;
                delete obj.useFieldMapping;
            }
            const excluded = (obj.excludedFields ?? []).filter(
                (f) => !removed.has(f.toLowerCase())
            );
            if (excluded.length) obj.excludedFields = excluded;
            else delete obj.excludedFields;
        }
    });
}

// Schaltet einen Parent-Eintrag zwischen "nur lesen" und "mitziehen" um.
// Beide Modi nutzen master:false: SFDMU holt nur Parents, auf die die Datensätze zeigen, ohne eigenen Filter.
export async function setParentMode(
    sfdmuDir: string,
    folder: string,
    index: number,
    mode: 'read' | 'pull'
): Promise<void> {
    const config = await readExport(sfdmuDir, folder);
    const parent = config.objects.slice(0, -1)[index];
    if (!parent) throw badRequest('Unbekannter Parent-Eintrag.');
    const object = objectOf(parent);

    let replacement: ExportObject;
    if (mode === 'read') {
        const ext = (parent.externalId ?? '').split(';').filter(Boolean);
        if (!ext.length) throw badRequest(`${object} hat keine External ID.`);
        replacement = {
            query: buildSoql({
                fields: ['Id', ...ext.filter((f) => f !== 'Id')],
                object,
                filters: [],
                rawWhere: null,
                tail: ''
            }),
            operation: 'Readonly',
            master: false,
            externalId: parent.externalId
        };
        // Nur gelesene Parents werden nicht geschrieben: ihr Wertemapping in diesem Ordner entfällt.
        await setObjectRows(sfdmuDir, folder, object, []);
    } else {
        const own = await folderOfObject(sfdmuDir, folder, object);
        if (!own)
            throw badRequest(
                `Für ${object} gibt es keine eigene Konfiguration (Objektordner). Sie wird zum Mitziehen gebraucht.`
            );
        const source = targetObject(await readExport(sfdmuDir, own));
        const p = parseSoql(source.query);
        if (!p.supported) throw conflict(`Die Query von ${own} ist nicht darstellbar.`);
        replacement = {
            ...source,
            query: buildSoql({ ...p, filters: [], rawWhere: null, tail: '' }),
            operation: 'Upsert',
            master: false
        };
        // Wertemapping des Parents aus seinem eigenen Ordner übernehmen (Kopie in diesem Ordner).
        const hasRows = await setObjectRows(
            sfdmuDir,
            folder,
            object,
            await rowsOfObject(sfdmuDir, own, object)
        );
        if (hasRows) replacement.useValuesMapping = true;
        else delete replacement.useValuesMapping;
    }
    await updateExport(sfdmuDir, folder, (cfg) => {
        cfg.objects[index] = replacement;
    });
}
