import { z } from 'zod';
import { RunModeSchema } from './objects';

export const StartRunRequestSchema = z.object({
    folder: z.string(),
    mode: RunModeSchema,
    cohortId: z.string().optional(), // Lauf auf eine Kohorte beschränken
    keepFilters: z.boolean().optional() // eigene Filter der Objekte zusätzlich zur Kohorte anwenden
});
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;

// Ereignisse des Lauf-Streams (SSE): Logtext und Ende.
export const RunEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('log'), text: z.string() }),
    z.object({
        type: z.literal('end'),
        code: z.number().nullable(),
        signal: z.string().nullable()
    })
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunStatusSchema = z.object({
    running: z.boolean(),
    folder: z.string().nullable(),
    mode: RunModeSchema.nullable()
});
export type RunStatus = z.infer<typeof RunStatusSchema>;
