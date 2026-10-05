import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    ExcludeRequestSchema,
    MappingRequestSchema,
    QuickQueryRequestSchema,
    ParentModeRequestSchema,
    SaveFiltersRequestSchema,
    SetFieldsRequestSchema,
    UpdateTodoRequestSchema,
    ValueMappingRequestSchema,
    type ProposalKind
} from '@studio/shared';
import type {
    DescribeResponse,
    ObjectDetail,
    ObjectListResponse,
    RunDetail,
    TodoListResponse
} from '@studio/shared';
import { z } from 'zod';
import { listDocs, readDoc } from './docs';
import { StudioApi } from './studioApi';
import { compareFields, summarizeRun, todoView } from './summaries';

export interface StudioMcpOptions {
    api: StudioApi;
    projectDir: string;
}

const text = (value: unknown) => ({
    content: [
        {
            type: 'text' as const,
            text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        }
    ]
});
const fail = (err: unknown) => ({
    isError: true,
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }]
});
// Jede Werkzeugantwort läuft durch diese Hülle: Fehler werden zu Meldungen statt zu Abbrüchen.
const safe =
    <A>(fn: (args: A) => Promise<unknown>) =>
    async (args: A) => {
        try {
            return text(await fn(args));
        } catch (err) {
            return fail(err);
        }
    };

const folder = z.string().describe('Objektordner, zum Beispiel 010_Account');

// Lesende Werkzeuge für Claude. Hier gibt es bewusst kein Schreiben, keine Läufe und keine Datensätze.
export function createStudioMcpServer({ api, projectDir }: StudioMcpOptions): McpServer {
    const server = new McpServer({ name: 'studio', version: '0.1.0' });

    server.registerTool(
        'list_objects',
        {
            description:
                'Alle Migrationsobjekte mit Operation, External ID, Anzahl Felder und Wertemappings und dem letzten Lauf.'
        },
        safe(async () => {
            const { objects, sourceAlias, targetAlias } =
                await api.get<ObjectListResponse>('/api/objects');
            return { sourceAlias, targetAlias, objects };
        })
    );

    server.registerTool(
        'get_object_config',
        {
            description:
                'Konfiguration eines Objekts: Query (Felder, Filter, Parents mit Modus), Mapping je Feld, Ausschlüsse und Wertemapping.',
            inputSchema: { folder }
        },
        safe(async ({ folder }: { folder: string }) => {
            const [detail, query] = await Promise.all([
                api.get<ObjectDetail>('/api/object', { folder }),
                api.get('/api/query', { folder })
            ]);
            return { detail, query };
        })
    );

    server.registerTool(
        'get_field_comparison',
        {
            description:
                'Vergleich der Query-Felder zwischen Quelle und Ziel (Typ, fehlt, nicht schreibbar) und Pflichtfelder im Ziel ohne Quellfeld.',
            inputSchema: { folder }
        },
        safe(async ({ folder }: { folder: string }) => {
            const [detail, describe] = await Promise.all([
                api.get<ObjectDetail>('/api/object', { folder }),
                api.get<DescribeResponse>('/api/describe', { folder })
            ]);
            return compareFields(detail, describe);
        })
    );

    server.registerTool(
        'list_runs',
        {
            description: 'Archivierte Läufe, neueste zuerst; optional nur eines Objekts.',
            inputSchema: { folder: folder.optional() }
        },
        safe(async ({ folder }: { folder?: string }) => {
            const { runs } = await api.get<{ runs: RunDetail['meta'][] }>(
                folder ? '/api/results' : '/api/results/all',
                { folder }
            );
            return runs.slice(0, 30).map((m) => ({
                folder: m.folder,
                id: m.id,
                object: m.object,
                mode: m.mode,
                startedAt: m.startedAt,
                ok: m.ok,
                counts: m.counts,
                cohort: m.cohort?.name ?? null
            }));
        })
    );

    server.registerTool(
        'get_run_results',
        {
            description:
                'Ergebnis eines Laufs: Kennzahlen, Warnungen und Fehler nach Ursache zusammengefasst. Enthält keine Bezeichnungen oder Ids von Datensätzen.',
            inputSchema: { folder, id: z.string().describe('Lauf-Id aus list_runs') }
        },
        safe(async ({ folder, id }: { folder: string; id: string }) =>
            summarizeRun(await api.get<RunDetail>('/api/results/run', { folder, id }))
        )
    );

    server.registerTool(
        'list_todos',
        {
            description:
                'Einträge der Migration-To-Do-Liste (ohne Beispieldatensätze); optional nur eines Objekts.',
            inputSchema: {
                object: z.string().optional().describe('Objektname, zum Beispiel Account')
            }
        },
        safe(async ({ object }: { object?: string }) => {
            const { items } = await api.get<TodoListResponse>('/api/todos');
            return items.filter((t) => !object || t.object === object).map(todoView);
        })
    );

    server.registerTool(
        'list_presets',
        {
            description: 'Gespeicherte Versionen der Konfiguration eines Objekts.',
            inputSchema: { folder }
        },
        safe(async ({ folder }: { folder: string }) => api.get('/api/presets', { folder }))
    );

    server.registerTool(
        'diff_preset',
        {
            description: 'Was sich ändert, wenn eine gespeicherte Version geladen würde.',
            inputSchema: { folder, id: z.string().describe('Id der Version aus list_presets') }
        },
        safe(async ({ folder, id }: { folder: string; id: string }) =>
            api.get('/api/presets/diff', { folder, id })
        )
    );

    server.registerTool(
        'read_doc',
        {
            description:
                'Projektdokumente unter docs/ lesen (zum Beispiel die Klärungsliste). Ohne name: Liste der Dokumente.',
            inputSchema: {
                name: z
                    .string()
                    .optional()
                    .describe('Dateiname, zum Beispiel Klaerungsliste_US_EU_Feldabgleich_CDEV5.md')
            }
        },
        safe(async ({ name }: { name?: string }) =>
            name ? readDoc(projectDir, name) : listDocs(projectDir)
        )
    );

    // Vorschläge: legen nur eine Karte im Chat an. Geändert wird erst, wenn die Person sie dort übernimmt.
    const reason = z.string().describe('Kurze Begründung für die Person (ein bis zwei Sätze)');
    const propose = (name: string, kind: ProposalKind, description: string, shape: z.ZodRawShape) =>
        server.registerTool(
            name,
            {
                description: `${description} Ändert nichts, sondern legt einen Vorschlag an, den die Person im Chat übernehmen muss.`,
                inputSchema: { ...shape, reason }
            },
            safe(async (args: Record<string, unknown>) => {
                const { reason: why, ...payload } = args;
                await api.propose({ kind, payload, reason: why });
                return 'Vorschlag angelegt. Er wartet im Chat auf die Bestätigung der Person; geändert wurde noch nichts.';
            })
        );

    propose(
        'propose_query_fields',
        'query-fields',
        'Felder der Query hinzufügen oder entfernen (add/remove mit API-Namen der Quelle; parentIndex nur für einen mitgezogenen Parent).',
        SetFieldsRequestSchema.shape
    );
    propose(
        'propose_filters',
        'query-filters',
        'Filter (WHERE) der Query ersetzen: entweder filters (Liste, oberste Ebene UND, { or: [...] } für ODER) oder rawWhere als Text.',
        SaveFiltersRequestSchema.shape
    );
    propose(
        'propose_parent_mode',
        'parent-mode',
        'Parent-Eintrag der Query auf "read" (nur lesen) oder "pull" (mitziehen) setzen; index zählt ab 0.',
        ParentModeRequestSchema.shape
    );
    propose(
        'propose_mapping',
        'mapping',
        'Ein Quellfeld einem anderen Zielfeld zuordnen (sourceField → targetField).',
        MappingRequestSchema.shape
    );
    propose(
        'propose_exclude',
        'exclude',
        'Ein Feld von der Migration ausschließen oder wieder aufnehmen.',
        ExcludeRequestSchema.shape
    );
    propose(
        'propose_value_mapping',
        'value-mapping',
        'Wertemapping eines Felds setzen. Die Regeln ersetzen alle bisherigen Regeln des Felds, gib deshalb die vollständige Liste an.',
        ValueMappingRequestSchema.shape
    );
    propose(
        'propose_soql_query',
        'soql-query',
        'Eine lesende SOQL-Abfrage (nur SELECT) vorschlagen, die die Person im Query-Editor gegen die Quelle (org "source") oder das Ziel (org "target") ausführt, zum Beispiel SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState. Du siehst das Ergebnis nicht.',
        QuickQueryRequestSchema.shape
    );
    propose(
        'propose_todo_status',
        'todo-status',
        'Status oder Notiz eines To-Do-Eintrags ändern (id aus list_todos).',
        UpdateTodoRequestSchema.shape
    );

    return server;
}
