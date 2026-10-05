import { z } from 'zod';

// Welche Datensätze der Cleaner anfasst. "me": nur vom Benutzer des Ziel-Alias angelegte (Standard und sicher),
// "any": alle Datensätze der gewählten Objekte (löscht auch Daten, die mit der Sandbox kamen).
export const CleanScopeSchema = z.object({
    creator: z.enum(['me', 'any']),
    since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT')
        .nullable()
        .optional()
});
export type CleanScope = z.infer<typeof CleanScopeSchema>;

export const CleanPlanRequestSchema = z.object({
    objects: z.array(z.string().regex(/^\w+$/)).min(1).max(100),
    scope: CleanScopeSchema,
    includeBlockers: z.boolean().default(true), // Objekte mitnehmen, die das Löschen anderer blockieren (zum Beispiel Cases am Account)
    blockersAnyCreator: z.boolean().default(false) // auch Blocker anderer Ersteller löschen
});
export type CleanPlanRequest = z.infer<typeof CleanPlanRequestSchema>;

export const CleanStepSchema = z.object({
    order: z.number(),
    object: z.string(), // Objekt, aus dem gelöscht wird (bei ContentVersion: ContentDocument)
    label: z.string(), // Anzeigename, zum Beispiel das Migrationsobjekt
    reason: z.enum(['migration', 'blocker']),
    blocks: z.string().nullable(), // Blocker: dessen Löschen es verhindert
    where: z.string(),
    count: z.number().nullable(),
    prepare: z.enum(['deactivate-orders']).nullable(),
    note: z.string().nullable()
});
export type CleanStep = z.infer<typeof CleanStepSchema>;

export const CleanPlanSchema = z.object({
    alias: z.string(),
    username: z.string(),
    createdAt: z.string(),
    scope: CleanScopeSchema,
    steps: z.array(CleanStepSchema),
    warnings: z.array(z.string()),
    total: z.number()
});
export type CleanPlan = z.infer<typeof CleanPlanSchema>;

export const StartCleanRequestSchema = CleanPlanRequestSchema.extend({
    confirm: z.string(), // Alias der Ziel-Org, wörtlich eingetippt
    hardDelete: z.boolean().default(true)
});
export type StartCleanRequest = z.infer<typeof StartCleanRequestSchema>;

export const CleanEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('log'), text: z.string() }),
    z.object({
        type: z.literal('step'),
        order: z.number(),
        object: z.string(),
        state: z.enum(['running', 'done', 'partial', 'failed', 'skipped']),
        deleted: z.number(),
        failed: z.number(),
        remaining: z.number().nullable()
    }),
    z.object({
        type: z.literal('end'),
        ok: z.boolean(),
        deleted: z.number(),
        failed: z.number(),
        stopped: z.boolean()
    })
]);
export type CleanEvent = z.infer<typeof CleanEventSchema>;

export const CleanStatusSchema = z.object({ running: z.boolean() });
export type CleanStatus = z.infer<typeof CleanStatusSchema>;

// Projektspezifische Regeln für den Cleaner (cleaner.config.json im Projektordner, wird versioniert).
// Sie ergänzen, was Salesforce selbst über blockierende Beziehungen meldet.
export const CleanerRulesSchema = z.object({
    // Voreinstellung für den Umfang im Formular
    defaultScope: CleanScopeSchema.optional(),
    // Objekte, die der Cleaner nie anfasst (zum Beispiel Stammdaten, die bleiben sollen)
    exclude: z.array(z.string().regex(/^\w+$/)).default([]),
    // Objekte, die das Löschen eines anderen Objekts verhindern und immer mit in den Plan gehören.
    blockers: z
        .array(
            z.object({
                object: z.string().regex(/^\w+$/), // blockierendes Objekt, zum Beispiel Entitlement
                field: z.string().regex(/^\w+$/), // Lookup auf das blockierte Objekt, zum Beispiel AccountId
                blocks: z.string().regex(/^\w+$/), // blockiertes Objekt, zum Beispiel Account
                anyCreator: z.boolean().default(false), // unabhängig vom Ersteller (zum Beispiel von Automatisierung angelegt)
                note: z.string().optional()
            })
        )
        .default([])
});
export type CleanerRules = z.infer<typeof CleanerRulesSchema>;
export type CleanerRulesInput = z.input<typeof CleanerRulesSchema>;
