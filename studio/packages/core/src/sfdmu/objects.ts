import type { FieldInfo, LastRun, ObjectDetail, ObjectSummary } from '@studio/shared';
import { notFound } from '../errors';
import { parseCsv } from './csv';
import {
    listFolders,
    objectOf,
    readExport,
    readValueMappingCsv,
    targetObject
} from './exportConfig';

export type LastRuns = Record<string, LastRun>;

// Standard-Lookups, deren Parent-Objekt sich aus dem Feldnamen ergibt.
const LOOKUP_PARENT: Record<string, string> = {
    AccountId: 'Account',
    ContactId: 'Contact',
    Product2Id: 'Product2',
    Pricebook2Id: 'Pricebook2',
    PricebookEntryId: 'PricebookEntry',
    OpportunityId: 'Opportunity',
    QuoteId: 'Quote',
    OrderId: 'Order',
    AssetId: 'Asset'
};

const OWNER_FIELD =
    /(^|By|To)UserId$|^(ActivatedById|CompanyAuthorizedById|CustomerAuthorizedById|AssetProvidedById|AssetServicedById)$/;

export async function listObjects(sfdmuDir: string, lastRuns: LastRuns): Promise<ObjectSummary[]> {
    return Promise.all(
        listFolders(sfdmuDir).map(async (folder) => {
            const objects = (await readExport(sfdmuDir, folder)).objects;
            const target = targetObject({ objects });
            return {
                folder,
                object: objectOf(target),
                operation: target.operation,
                externalId: target.externalId || null,
                readonlyParents: objects.slice(0, -1).map(objectOf),
                lastRun: lastRuns[folder] ?? null
            };
        })
    );
}

export async function objectDetail(
    sfdmuDir: string,
    folder: string,
    lastRuns: LastRuns
): Promise<ObjectDetail> {
    const entry = (await listObjects(sfdmuDir, lastRuns)).find((o) => o.folder === folder);
    if (!entry) throw notFound('Unbekannter Ordner.');
    const target = targetObject(await readExport(sfdmuDir, folder));
    const select = target.query.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i)?.[1] ?? '';
    const extIds = (target.externalId || '').split(';').filter(Boolean);
    const where = target.query.match(/\sWHERE\s+([\s\S]+)$/i)?.[1]?.trim() ?? null;

    const csv = parseCsv(await readValueMappingCsv(sfdmuDir));
    const valueMappings = csv
        .slice(1)
        .filter((r) => r[0] === entry.object)
        .map((r) => ({ field: r[1] ?? '', from: r[2] ?? '', to: r[3] ?? '' }));
    const mappedFields = new Set(valueMappings.map((m) => m.field));
    const fieldMapping = (target.fieldMapping ?? []).filter(
        (m) => !m.targetObject || m.targetObject === entry.object
    );
    const excluded = new Set(target.excludedFields ?? []);
    const targetOf = new Map(fieldMapping.map((m) => [m.sourceField, m.targetField]));

    const fields: FieldInfo[] = select
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
        .map((name) => {
            const parent = LOOKUP_PARENT[name] ?? null;
            const targetField = targetOf.get(name) ?? name;
            return {
                name,
                lookup: name !== 'Id' && /Id$/.test(name),
                parent,
                parentReadonly: !!parent && entry.readonlyParents.includes(parent),
                owner: name === 'OwnerId' || OWNER_FIELD.test(name),
                externalId: extIds.includes(name),
                valueMapped: mappedFields.has(name),
                excluded: excluded.has(name),
                targetField,
                renamed: targetOf.has(name) && targetField !== name
            };
        });
    return { ...entry, where, fields, valueMappings };
}
