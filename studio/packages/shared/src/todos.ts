import { z } from 'zod';

export const TODO_CATEGORIES = {
    'state-invalid': 'Ungültiger State',
    'state-needs-country': 'Land fehlt für State',
    picklist: 'Picklist-Wert ungültig',
    required: 'Pflichtfeld fehlt',
    validation: 'Validierungsregel',
    duplicate: 'Duplikat',
    'too-long': 'Text zu lang',
    lookup: 'Lookup ungültig',
    'parent-missing': 'Parent fehlt',
    lock: 'Zeile gesperrt',
    other: 'Nicht klassifiziert'
} as const;
export type TodoCategory = keyof typeof TODO_CATEGORIES;
export const TodoCategorySchema = z.enum(
    Object.keys(TODO_CATEGORIES) as [TodoCategory, ...TodoCategory[]]
);

export const TODO_STATUS_LABELS = {
    open: 'Offen',
    doing: 'In Arbeit',
    done: 'Erledigt',
    wontfix: 'Wird nicht behoben'
} as const;
export const TodoStatusSchema = z.enum(['open', 'doing', 'done', 'wontfix']);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const TodoRunRefSchema = z.object({ folder: z.string(), id: z.string(), at: z.string() });

export const TodoItemSchema = z.object({
    id: z.string(), // Fingerabdruck aus Objekt, Kategorie, Feld und bereinigter Meldung
    object: z.string(),
    folder: z.string(), // Objektordner des Laufs, für den Link in die Konfiguration
    category: TodoCategorySchema,
    field: z.string().nullable(), // betroffenes Feld (Label oder API-Name, wie die Meldung es nennt)
    apiField: z.string().nullable(), // API-Name, falls sicher ableitbar
    message: z.string(), // bereinigte Meldung
    suggestion: z.string(),
    step: z.enum(['query', 'mapping', 'werte']).nullable(), // Konfigurationsschritt, der hilft
    status: TodoStatusSchema,
    note: z.string(),
    count: z.number(), // Datensätze im zuletzt übernommenen Lauf
    examples: z.array(z.object({ label: z.string(), id: z.string() })),
    firstRun: TodoRunRefSchema,
    lastRun: TodoRunRefSchema,
    createdAt: z.string(),
    updatedAt: z.string()
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const TodoListResponseSchema = z.object({ items: z.array(TodoItemSchema) });
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;

export const ImportTodosRequestSchema = z.object({
    folder: z.string(),
    id: z.string(),
    // Positionen der gewählten Fehler in der Fehlerliste des Laufs; ohne Angabe werden alle Fehler übernommen
    errorIndexes: z.array(z.number().int().min(0)).max(10000).optional(),
    includeMissingParents: z.boolean().default(true)
});
export type ImportTodosRequest = z.input<typeof ImportTodosRequestSchema>;

export const ImportTodosResponseSchema = z.object({
    added: z.number(),
    updated: z.number(),
    reopened: z.number()
});
export type ImportTodosResponse = z.infer<typeof ImportTodosResponseSchema>;

export const UpdateTodoRequestSchema = z.object({
    id: z.string(),
    status: TodoStatusSchema.optional(),
    note: z.string().max(2000).optional()
});
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>;
