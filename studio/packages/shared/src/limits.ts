import { z } from 'zod';

export const LimitLevelSchema = z.enum(['ok', 'warn', 'crit']);
export type LimitLevel = z.infer<typeof LimitLevelSchema>;

export const OrgLimitSchema = z.object({
    key: z.string(), // API-Name, zum Beispiel DailyApiRequests
    label: z.string(),
    unit: z.string(), // "Aufrufe", "Batches", "MB"
    hint: z.string(), // wofür das Limit im Projekt eine Rolle spielt
    max: z.number(),
    remaining: z.number(),
    used: z.number(),
    percentUsed: z.number(),
    level: LimitLevelSchema
});
export type OrgLimit = z.infer<typeof OrgLimitSchema>;

export const OrgLimitsSchema = z.object({
    role: z.enum(['source', 'target']),
    alias: z.string(),
    limits: z.array(OrgLimitSchema),
    error: z.string().nullable()
});
export type OrgLimits = z.infer<typeof OrgLimitsSchema>;

export const LimitsResponseSchema = z.object({
    orgs: z.array(OrgLimitsSchema),
    checkedAt: z.string()
});
export type LimitsResponse = z.infer<typeof LimitsResponseSchema>;
