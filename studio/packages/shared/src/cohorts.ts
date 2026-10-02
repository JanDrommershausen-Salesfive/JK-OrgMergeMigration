import { z } from 'zod';
import { FilterNodeSchema } from './query';

// Obergrenze für ID-Listen: SFDMU übergibt sie in der Abfrage; ab etwa 2.000 IDs lehnt Salesforce die Anfrage ab.
export const MAX_COHORT_SIZE = 500;

export const CohortRuleSchema = z.discriminatedUnion('kind', [
    // Zufällige Stichprobe aus den Root-Datensätzen, optional mit Filter
    z.object({
        kind: z.literal('sample'),
        size: z.number().int().min(1).max(MAX_COHORT_SIZE),
        filters: z.array(FilterNodeSchema).max(20).default([])
    }),
    // Feste Liste von Ids
    z.object({
        kind: z.literal('ids'),
        ids: z
            .array(z.string().regex(/^[a-zA-Z0-9]{15,18}$/, 'Ungültige Id'))
            .min(1)
            .max(MAX_COHORT_SIZE)
    })
]);
export type CohortRule = z.infer<typeof CohortRuleSchema>;

// Eine Kohorte ist eine feste Menge von Root-Datensätzen (Account) der Quelle. Alle abhängigen Objekte folgen ihr.
export const CohortSchema = z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    rootObject: z.string(),
    rule: CohortRuleSchema,
    ids: z.array(z.string()),
    count: z.number()
});
export type Cohort = z.infer<typeof CohortSchema>;

export const CohortListResponseSchema = z.object({ cohorts: z.array(CohortSchema) });
export type CohortListResponse = z.infer<typeof CohortListResponseSchema>;

export const CreateCohortRequestSchema = z.object({
    name: z.string().trim().min(1).max(60),
    rule: CohortRuleSchema
});
export type CreateCohortRequest = z.infer<typeof CreateCohortRequestSchema>;

// Wie viele Datensätze je Objekt in der Kohorte liegen (Vorschau auf Speicherbedarf).
export const CohortPreviewRowSchema = z.object({
    folder: z.string(),
    object: z.string(),
    scoped: z.boolean(), // folgt der Kohorte
    count: z.number().nullable(),
    via: z.string().nullable(), // Pfad zum Root, zum Beispiel Opportunity.AccountId
    note: z.string().nullable()
});
export type CohortPreviewRow = z.infer<typeof CohortPreviewRowSchema>;

export const CohortPreviewSchema = z.object({ rows: z.array(CohortPreviewRowSchema) });
export type CohortPreview = z.infer<typeof CohortPreviewSchema>;
