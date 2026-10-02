import { z } from 'zod';

export const OrgStatusSchema = z.discriminatedUnion('connected', [
    z.object({
        connected: z.literal(false),
        alias: z.string(),
        error: z.string(),
        instanceUrl: z.string().nullable(),
        username: z.string().nullable()
    }),
    z.object({
        connected: z.literal(true),
        alias: z.string(),
        orgId: z.string(),
        name: z.string(),
        isSandbox: z.boolean(),
        instance: z.string(),
        instanceUrl: z.string().nullable(),
        username: z.string().nullable(),
        idMatches: z.boolean()
    })
]);
export type OrgStatus = z.infer<typeof OrgStatusSchema>;

export const OrgsResponseSchema = z.object({
    source: OrgStatusSchema,
    target: OrgStatusSchema,
    checkedAt: z.string()
});
export type OrgsResponse = z.infer<typeof OrgsResponseSchema>;

export const DescribedFieldSchema = z.object({
    type: z.string(),
    baseType: z.string(),
    label: z.string(),
    createable: z.boolean(),
    updateable: z.boolean()
});
export type DescribedField = z.infer<typeof DescribedFieldSchema>;

export const DescribeResultSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), fields: z.record(z.string(), DescribedFieldSchema) }),
    z.object({ ok: z.literal(false), error: z.string() })
]);
export type DescribeResult = z.infer<typeof DescribeResultSchema>;

export const DescribeResponseSchema = z.object({
    source: DescribeResultSchema,
    target: DescribeResultSchema
});
export type DescribeResponse = z.infer<typeof DescribeResponseSchema>;
