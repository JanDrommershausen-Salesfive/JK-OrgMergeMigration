import { z } from 'zod';

export const QuickQueryRequestSchema = z.object({
    org: z.enum(['source', 'target']), // die Org kommt aus der Projektdatei, nie als Alias aus der Anfrage
    soql: z.string().trim().min(1, 'Query fehlt').max(4000)
});
export type QuickQueryRequest = z.infer<typeof QuickQueryRequestSchema>;

export const QuickQueryResultSchema = z.object({
    alias: z.string(),
    soql: z.string(), // so, wie sie ausgeführt wurde (mit ergänztem LIMIT)
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())), // Zellen als Text, leer = kein Wert
    totalSize: z.number(), // Treffer laut Salesforce
    truncated: z.boolean() // mehr Treffer als geliefert
});
export type QuickQueryResult = z.infer<typeof QuickQueryResultSchema>;
