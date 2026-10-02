import { z } from 'zod';

export const HealthResponseSchema = z.object({
    status: z.literal('ok'),
    version: z.string(),
    projectDir: z.string(),
    projectConfigured: z.boolean()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
