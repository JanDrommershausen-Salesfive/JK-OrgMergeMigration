import { z } from 'zod';

export const RunModeSchema = z.enum(['simulation', 'live']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const LastRunSchema = z.object({
    at: z.string(),
    mode: RunModeSchema,
    ok: z.boolean(),
    stopped: z.boolean(),
    // Kennzahlen des Laufs (ältere Einträge haben sie nicht)
    inserted: z.number().optional(),
    updated: z.number().optional(),
    errors: z.number().optional(),
    missingParents: z.number().optional(),
    runId: z.string().optional()
});
export type LastRun = z.infer<typeof LastRunSchema>;

export const ObjectSummarySchema = z.object({
    folder: z.string(),
    object: z.string(),
    operation: z.string(),
    externalId: z.string().nullable(),
    readonlyParents: z.array(z.string()),
    fieldCount: z.number().default(0), // Felder der Query
    valueMappingCount: z.number().default(0), // Wertemapping-Zeilen des Objekts
    lastRun: LastRunSchema.nullable()
});
export type ObjectSummary = z.infer<typeof ObjectSummarySchema>;

export const FieldInfoSchema = z.object({
    name: z.string(),
    lookup: z.boolean(),
    parent: z.string().nullable(),
    parentReadonly: z.boolean(),
    owner: z.boolean(),
    externalId: z.boolean(),
    valueMapped: z.boolean(),
    excluded: z.boolean(),
    targetField: z.string(),
    renamed: z.boolean()
});
export type FieldInfo = z.infer<typeof FieldInfoSchema>;

export const ValueMappingRowSchema = z.object({
    field: z.string(),
    from: z.string(),
    to: z.string()
});
export type ValueMappingRow = z.infer<typeof ValueMappingRowSchema>;

export const ObjectDetailSchema = ObjectSummarySchema.extend({
    parentIndex: z.number().nullable(), // gesetzt: Detail eines Parent-Eintrags der export.json
    where: z.string().nullable(),
    fields: z.array(FieldInfoSchema),
    valueMappings: z.array(ValueMappingRowSchema)
});
export type ObjectDetail = z.infer<typeof ObjectDetailSchema>;

export const ObjectListResponseSchema = z.object({
    objects: z.array(ObjectSummarySchema),
    running: z.boolean(),
    configured: z.boolean(),
    staleProjectPath: z.string().nullable(),
    sourceAlias: z.string(),
    targetAlias: z.string()
});
export type ObjectListResponse = z.infer<typeof ObjectListResponseSchema>;

// Anfragen, die export.json bzw. ValueMapping.csv ändern.
export const MappingRequestSchema = z.object({
    folder: z.string(),
    parentIndex: z.number().int().min(0).optional(),
    sourceField: z.string(),
    targetField: z.string()
});
export type MappingRequest = z.infer<typeof MappingRequestSchema>;

export const ExcludeRequestSchema = z.object({
    folder: z.string(),
    parentIndex: z.number().int().min(0).optional(),
    field: z.string(),
    excluded: z.boolean()
});
export type ExcludeRequest = z.infer<typeof ExcludeRequestSchema>;

export const ValueMappingRequestSchema = z.object({
    folder: z.string(),
    parentIndex: z.number().int().min(0).optional(),
    field: z.string(),
    rows: z.array(z.object({ from: z.string(), to: z.string() }))
});
export type ValueMappingRequest = z.infer<typeof ValueMappingRequestSchema>;

// Wertemapping aus der Mapping-Datei (Excel, Blatt "Picklist Mapping") übernehmen.
export const ValueMappingSyncRequestSchema = z.object({
    folder: z.string(),
    parentIndex: z.number().int().min(0).optional()
});
export type ValueMappingSyncRequest = z.infer<typeof ValueMappingSyncRequestSchema>;

export const ValueMappingSyncSchema = z.object({
    file: z.string().nullable(), // Pfad relativ zum Projekt; null: keine Mapping-Datei gefunden
    added: z.array(ValueMappingRowSchema),
    // Quellwerte, die in der CSV schon anders gemappt sind. Die CSV bleibt, wie sie ist.
    conflicts: z.array(
        z.object({ field: z.string(), from: z.string(), csv: z.string(), file: z.string() })
    ),
    error: z.string().optional() // Datei nicht lesbar; die eigentliche Änderung ist trotzdem gespeichert
});
export type ValueMappingSync = z.infer<typeof ValueMappingSyncSchema>;

export const ValueMappingSyncResponseSchema = z.object({
    detail: ObjectDetailSchema,
    sync: ValueMappingSyncSchema
});
export type ValueMappingSyncResponse = z.infer<typeof ValueMappingSyncResponseSchema>;

// Excel-Dateien in Mappings/ und die gewählte (mapping.config.json). Ohne Wahl wird nichts übernommen.
export const MappingFilesResponseSchema = z.object({
    files: z.array(
        z.object({
            file: z.string(),
            modified: z.string(),
            usable: z.boolean(),
            problem: z.string().optional()
        })
    ),
    selected: z.string().nullable()
});
export type MappingFilesResponse = z.infer<typeof MappingFilesResponseSchema>;

export const SelectMappingFileRequestSchema = z.object({ file: z.string().max(500).nullable() });
export type SelectMappingFileRequest = z.infer<typeof SelectMappingFileRequestSchema>;
