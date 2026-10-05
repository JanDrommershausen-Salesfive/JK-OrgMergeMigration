import { z } from 'zod';
import { RunModeSchema } from './objects';

export const RunCountsSchema = z.object({
    inserted: z.number(),
    updated: z.number(),
    deleted: z.number(),
    errors: z.number(), // Datensätze mit Fehlertext in den target-CSVs
    missingParents: z.number(), // Datensätze mit nicht gefundenem Parent
    warnings: z.number()
});
export type RunCounts = z.infer<typeof RunCountsSchema>;

export const PassSummarySchema = z.object({
    pass: z.number(),
    updated: z.number(),
    deleted: z.number(),
    inserted: z.number()
});

// "DATA PROCESSING SUMMARY" aus dem SFDMU-Log, je Objekt.
export const ObjectSummaryEntrySchema = z.object({
    object: z.string(),
    processed: z.number(),
    passes: z.array(PassSummarySchema)
});
export type ObjectSummaryEntry = z.infer<typeof ObjectSummaryEntrySchema>;

export const LogWarningSchema = z.object({
    kind: z.enum(['missing-field', 'missing-parents', 'other']),
    message: z.string(),
    count: z.number()
});
export type LogWarning = z.infer<typeof LogWarningSchema>;

// meta.json eines archivierten Laufs.
export const RunMetaSchema = z.object({
    id: z.string(),
    folder: z.string(),
    object: z.string(),
    mode: RunModeSchema,
    startedAt: z.string(),
    endedAt: z.string(),
    durationMs: z.number(),
    ok: z.boolean(),
    stopped: z.boolean(),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    sourceAlias: z.string(),
    targetAlias: z.string(),
    counts: RunCountsSchema,
    summary: z.array(ObjectSummaryEntrySchema),
    warnings: z.array(LogWarningSchema),
    logErrors: z.array(z.string()),
    cohort: z.object({ id: z.string(), name: z.string(), count: z.number() }).nullable().optional()
});
export type RunMeta = z.infer<typeof RunMetaSchema>;

export const RunListResponseSchema = z.object({ runs: z.array(RunMetaSchema) });
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const ErrorRowSchema = z.object({
    file: z.string(), // z. B. insert oder update
    id: z.string(),
    oldId: z.string(),
    label: z.string(),
    error: z.string()
});
export type ErrorRow = z.infer<typeof ErrorRowSchema>;

export const MissingParentRowSchema = z.object({
    lookupField: z.string(),
    parentObject: z.string(),
    value: z.string(),
    recordId: z.string(),
    object: z.string()
});
export type MissingParentRow = z.infer<typeof MissingParentRowSchema>;

export const MissingParentGroupSchema = z.object({
    lookupField: z.string(),
    parentObject: z.string(),
    value: z.string(),
    records: z.number()
});
export type MissingParentGroup = z.infer<typeof MissingParentGroupSchema>;

export const RunDetailSchema = z.object({
    meta: RunMetaSchema,
    errors: z.array(ErrorRowSchema),
    errorsTotal: z.number(),
    missingParents: z.array(MissingParentRowSchema),
    missingParentsTotal: z.number(),
    missingParentGroups: z.array(MissingParentGroupSchema)
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

export const RunLogResponseSchema = z.object({ log: z.string() });
