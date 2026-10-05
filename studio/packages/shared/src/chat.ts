import { z } from 'zod';
import { ExcludeRequestSchema, MappingRequestSchema, ValueMappingRequestSchema } from './objects';
import { ParentModeRequestSchema, SaveFiltersRequestSchema, SetFieldsRequestSchema } from './query';
import { QuickQueryRequestSchema } from './quickQuery';
import { UpdateTodoRequestSchema } from './todos';

// Änderungsvorschläge von Claude. Sie ändern nichts, bis die Person sie in der Oberfläche übernimmt.
export const PROPOSAL_PAYLOADS = {
    'query-fields': SetFieldsRequestSchema,
    'query-filters': SaveFiltersRequestSchema,
    'parent-mode': ParentModeRequestSchema,
    mapping: MappingRequestSchema,
    exclude: ExcludeRequestSchema,
    'value-mapping': ValueMappingRequestSchema,
    'todo-status': UpdateTodoRequestSchema,
    'soql-query': QuickQueryRequestSchema // wird nicht ausgeführt, sondern im Query-Editor geöffnet
} as const;
export type ProposalKind = keyof typeof PROPOSAL_PAYLOADS;
export const ProposalKindSchema = z.enum(
    Object.keys(PROPOSAL_PAYLOADS) as [ProposalKind, ...ProposalKind[]]
);

export const ProposalStatusSchema = z.enum(['pending', 'applied', 'rejected', 'failed']);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalSchema = z.object({
    id: z.string(),
    kind: ProposalKindSchema,
    folder: z.string().nullable(), // betroffenes Objekt; null bei To-Do-Änderungen
    title: z.string(), // eine Zeile, was geändert wird
    details: z.array(z.string()), // genauer: einzelne Felder, Regeln, Bedingungen
    reason: z.string(), // Begründung von Claude
    status: ProposalStatusSchema,
    message: z.string().optional(), // Ergebnis der Übernahme (Backup, Fehler)
    createdAt: z.string()
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const CreateProposalRequestSchema = z.object({
    kind: ProposalKindSchema,
    payload: z.record(z.unknown()),
    reason: z.string().trim().min(1).max(600)
});
export type CreateProposalRequest = z.infer<typeof CreateProposalRequestSchema>;

export const ProposalIdRequestSchema = z.object({ id: z.string() });

// Ereignisse eines Chat-Gesprächs, in der Reihenfolge, wie sie ins Overlay gestreamt werden.
export const ChatEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('user'), text: z.string() }),
    z.object({ type: z.literal('text'), text: z.string() }), // Antworttext, in Stücken
    z.object({ type: z.literal('tool'), name: z.string(), summary: z.string() }), // Claude ruft ein Werkzeug auf
    z.object({ type: z.literal('end'), ok: z.boolean(), error: z.string().optional() }),
    z.object({ type: z.literal('proposal'), proposal: ProposalSchema }),
    z.object({
        type: z.literal('proposal-status'),
        id: z.string(),
        status: ProposalStatusSchema,
        message: z.string().optional()
    }),
    z.object({ type: z.literal('reset') })
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

// Wo der Nutzer gerade ist; geht als Kontext mit jeder Nachricht mit.
export const ChatContextSchema = z.object({
    page: z.string().max(200).optional(), // Adresse in der GUI, zum Beispiel /konfiguration/010_Account/mapping
    folder: z.string().max(100).optional(),
    runId: z.string().max(100).optional()
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

export const SendChatRequestSchema = z.object({
    message: z.string().trim().min(1, 'Nachricht fehlt').max(8000),
    context: ChatContextSchema.optional()
});
export type SendChatRequest = z.infer<typeof SendChatRequestSchema>;

export const ChatStatusSchema = z.object({
    running: z.boolean(),
    available: z.boolean(), // Claude-CLI gefunden
    version: z.string().nullable(),
    hint: z.string().nullable() // was zu tun ist, wenn sie fehlt
});
export type ChatStatus = z.infer<typeof ChatStatusSchema>;
