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
    updateable: z.boolean(),
    relationshipName: z.string().nullable().optional(),
    required: z.boolean().optional() // im Ziel ohne Wert nicht anlegbar (Pflichtfeld ohne Standard)
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

// Angemeldete Orgs der sf-CLI (sf org list), für die Auswahl in der GUI.
export const AvailableOrgSchema = z.object({
    alias: z.string().nullable(),
    username: z.string(),
    orgId: z.string(),
    instanceUrl: z.string(),
    isSandbox: z.boolean(),
    isScratch: z.boolean(),
    status: z.string()
});
export type AvailableOrg = z.infer<typeof AvailableOrgSchema>;

export const AvailableOrgsResponseSchema = z.object({ orgs: z.array(AvailableOrgSchema) });
export type AvailableOrgsResponse = z.infer<typeof AvailableOrgsResponseSchema>;

// Neue Org per Browser-Login anmelden (sf org login web).
export const OrgAliasSchema = z.string().regex(/^[A-Za-z0-9][\w.-]{0,39}$/, 'Ungültiger Alias');

export const LoginRequestSchema = z.object({
    alias: OrgAliasSchema,
    kind: z.enum(['production', 'sandbox', 'custom']),
    instanceUrl: z.string().optional()
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Quelle und Ziel für das Projekt festlegen (pinnt die Org-IDs).
export const SelectOrgsRequestSchema = z.object({
    sourceAlias: OrgAliasSchema,
    targetAlias: OrgAliasSchema
});
export type SelectOrgsRequest = z.infer<typeof SelectOrgsRequestSchema>;
