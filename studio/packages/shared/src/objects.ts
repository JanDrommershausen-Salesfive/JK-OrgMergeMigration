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
    sourceField: z.string(),
    targetField: z.string()
});
export type MappingRequest = z.infer<typeof MappingRequestSchema>;

export const ExcludeRequestSchema = z.object({
    folder: z.string(),
    field: z.string(),
    excluded: z.boolean()
});
export type ExcludeRequest = z.infer<typeof ExcludeRequestSchema>;

export const ValueMappingRequestSchema = z.object({
    folder: z.string(),
    field: z.string(),
    rows: z.array(z.object({ from: z.string(), to: z.string() }))
});
export type ValueMappingRequest = z.infer<typeof ValueMappingRequestSchema>;
