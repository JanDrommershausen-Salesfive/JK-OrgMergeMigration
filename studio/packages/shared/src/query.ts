import { z } from 'zod';

// Wert in einer WHERE-Bedingung, so wie SOQL ihn kennt.
export const FilterValueSchema: z.ZodType<FilterValue> = z.lazy(() =>
    z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('string'), value: z.string() }),
        z.object({ kind: z.literal('number'), value: z.string() }),
        z.object({ kind: z.literal('boolean'), value: z.boolean() }),
        z.object({ kind: z.literal('null') }),
        z.object({ kind: z.literal('date'), value: z.string() }), // 2026-01-01 oder 2026-01-01T00:00:00Z
        z.object({ kind: z.literal('literal'), value: z.string() }), // LAST_N_DAYS:7, TODAY, THIS_YEAR …
        z.object({ kind: z.literal('list'), values: z.array(FilterValueSchema) })
    ])
);
export type FilterValue =
    | { kind: 'string'; value: string }
    | { kind: 'number'; value: string }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'null' }
    | { kind: 'date'; value: string }
    | { kind: 'literal'; value: string }
    | { kind: 'list'; values: FilterValue[] };

export const FILTER_OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'IN', 'NOT IN'] as const;
export const FilterOperatorSchema = z.enum(FILTER_OPERATORS);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const FilterSchema = z.object({
    field: z.string().regex(/^[A-Za-z_][\w.]*$/, 'Ungültiger Feldname'),
    op: FilterOperatorSchema,
    value: FilterValueSchema
});
export type Filter = z.infer<typeof FilterSchema>;

// Eine Gruppe, in der mindestens eine Bedingung zutreffen muss (ODER). Oberste Ebene: alle Einträge (UND).
export const OrGroupSchema = z.object({ or: z.array(FilterSchema).min(2) });
export type OrGroup = z.infer<typeof OrGroupSchema>;
export const FilterNodeSchema = z.union([FilterSchema, OrGroupSchema]);
export type FilterNode = Filter | OrGroup;
export const isOrGroup = (n: FilterNode): n is OrGroup => 'or' in n;

// Parent-Eintrag der export.json (alles vor dem Zielobjekt).
export const ParentEntrySchema = z.object({
    index: z.number(),
    object: z.string(),
    operation: z.string(),
    master: z.boolean(), // false: nur Datensätze, auf die die Kind-Datensätze zeigen
    externalId: z.string().nullable(),
    where: z.string().nullable(),
    fields: z.array(z.string()),
    mode: z.enum(['read', 'pull', 'custom']), // read: nur lesen, pull: mitziehen
    configFolder: z.string().nullable() // Objektordner mit der eigenen Konfiguration dieses Parents
});
export type ParentEntry = z.infer<typeof ParentEntrySchema>;

export const QueryModelSchema = z.object({
    folder: z.string(),
    object: z.string(),
    soql: z.string(), // vollständige Query des Zielobjekts, wie sie in export.json steht
    fields: z.array(z.string()),
    // null: WHERE ist nicht als Zeilen darstellbar (Rohmodus), dann steht der Text in rawWhere
    filters: z.array(FilterNodeSchema).nullable(),
    rawWhere: z.string().nullable(),
    tail: z.string(), // ORDER BY / LIMIT / OFFSET
    supported: z.boolean(), // false: Query nicht darstellbar (Unterabfragen, Funktionen)
    parents: z.array(ParentEntrySchema)
});
export type QueryModel = z.infer<typeof QueryModelSchema>;

export const SaveFiltersRequestSchema = z.object({
    folder: z.string(),
    filters: z.array(FilterNodeSchema).max(50).optional(),
    rawWhere: z.string().max(4000).optional() // statt filters: WHERE als Text (Experten-Modus)
});
export type SaveFiltersRequest = z.infer<typeof SaveFiltersRequestSchema>;

// Felder der Query an- oder abwählen. Mit parentIndex gilt es für einen mitgezogenen Parent-Eintrag.
export const SetFieldsRequestSchema = z.object({
    folder: z.string(),
    parentIndex: z.number().int().min(0).optional(),
    add: z
        .array(z.string().regex(/^[A-Za-z_]\w*$/, 'Ungültiger Feldname'))
        .max(500)
        .default([]),
    remove: z
        .array(z.string().regex(/^[A-Za-z_]\w*$/, 'Ungültiger Feldname'))
        .max(500)
        .default([])
});
export type SetFieldsRequest = z.infer<typeof SetFieldsRequestSchema>;

export const ParentModeRequestSchema = z.object({
    folder: z.string(),
    index: z.number().int().min(0),
    mode: z.enum(['read', 'pull'])
});
export type ParentModeRequest = z.infer<typeof ParentModeRequestSchema>;

export const ParentCheckSchema = z.object({
    object: z.string(),
    lookupField: z.string().nullable(),
    referenced: z.number().nullable(), // verschiedene Parent-Werte, auf die die Datensätze zeigen
    existingInTarget: z.number().nullable(),
    missing: z.number().nullable(), // referenziert, aber im Ziel nicht vorhanden
    note: z.string().nullable()
});
export type ParentCheck = z.infer<typeof ParentCheckSchema>;

export const QueryCheckSchema = z.object({
    count: z.number().nullable(),
    error: z.string().nullable(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    parents: z.array(ParentCheckSchema)
});
export type QueryCheck = z.infer<typeof QueryCheckSchema>;
