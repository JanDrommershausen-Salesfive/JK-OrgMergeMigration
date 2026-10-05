import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createStudioMcpServer } from './server';
import { StudioApi } from './studioApi';

const STATE =
    "There's a problem with this state, even though it may appear correct. Please select a state from the list of valid states.: Billing State/Province";
const meta = {
    id: '1',
    folder: '010_Account',
    object: 'Account',
    mode: 'live',
    startedAt: 'x',
    endedAt: 'x',
    durationMs: 5,
    ok: true,
    stopped: false,
    sourceAlias: 'us-prod',
    targetAlias: 'CDEV5',
    counts: { errors: 2 },
    summary: [],
    warnings: []
};
const routes: Record<string, unknown> = {
    '/api/chat/proposals': { id: 'p1' },
    '/api/results/run': {
        meta,
        errors: [
            {
                file: 'insert',
                id: '#N/A',
                oldId: '001SECRET',
                label: 'Geheime Kunde GmbH',
                error: STATE
            },
            { file: 'insert', id: '#N/A', oldId: '001OTHER', label: 'Anderer Kunde', error: STATE }
        ],
        errorsTotal: 2,
        missingParents: [],
        missingParentsTotal: 1,
        missingParentGroups: [
            {
                lookupField: 'ParentId',
                parentObject: 'Account',
                value: 'Geheimer Parent',
                records: 3
            }
        ]
    },
    '/api/todos': {
        items: [
            {
                id: 'a',
                object: 'Account',
                category: 'state-invalid',
                field: 'BillingState',
                message: 'm',
                suggestion: 's',
                status: 'open',
                note: '',
                count: 2,
                examples: [{ label: 'Geheime Kunde GmbH', id: '001SECRET' }],
                lastRun: { id: '1' }
            }
        ]
    }
};

async function connect() {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const fakeFetch = (async (url: URL, init?: RequestInit) => {
        calls.push({
            method: init?.method ?? 'GET',
            path: url.pathname,
            body: init?.body ? JSON.parse(String(init.body)) : undefined
        });
        const body = routes[url.pathname];
        return body
            ? new Response(JSON.stringify(body))
            : new Response(JSON.stringify({ error: 'nicht da' }), { status: 404 });
    }) as unknown as typeof fetch;
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'mcp-'));
    await mkdir(path.join(projectDir, 'docs'));
    await writeFile(path.join(projectDir, 'docs', 'Notiz.md'), '# Notiz');
    const server = createStudioMcpServer({
        api: new StudioApi('http://127.0.0.1:4174', fakeFetch),
        projectDir
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    return { client, calls };
}
const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

describe('Studio-MCP-Server', () => {
    it('bietet Lesewerkzeuge und Vorschlagswerkzeuge an, aber keine direkt ändernden', async () => {
        const { client } = await connect();
        const names = (await client.listTools()).tools.map((t) => t.name).sort();
        expect(names).toEqual([
            'diff_preset',
            'get_field_comparison',
            'get_object_config',
            'get_run_results',
            'list_objects',
            'list_presets',
            'list_runs',
            'list_todos',
            'propose_exclude',
            'propose_filters',
            'propose_mapping',
            'propose_parent_mode',
            'propose_query_fields',
            'propose_soql_query',
            'propose_todo_status',
            'propose_value_mapping',
            'read_doc'
        ]);
    });

    it('fasst Fehler zusammen und gibt keine Datensatzinhalte weiter', async () => {
        const { client } = await connect();
        const out = textOf(
            await client.callTool({
                name: 'get_run_results',
                arguments: { folder: '010_Account', id: '1' }
            })
        );
        const parsed = JSON.parse(out);
        expect(parsed.errorGroups).toEqual([
            expect.objectContaining({ category: 'state-invalid', count: 2 })
        ]);
        expect(parsed.missingParents).toEqual([{ lookup: 'ParentId -> Account', records: 3 }]);
        for (const secret of ['SECRET', 'Geheime', 'Anderer Kunde', 'Geheimer Parent'])
            expect(out).not.toContain(secret);
    });

    it('liefert To-Dos ohne Beispiele', async () => {
        const { client } = await connect();
        const out = textOf(
            await client.callTool({ name: 'list_todos', arguments: { object: 'Account' } })
        );
        expect(JSON.parse(out)).toHaveLength(1);
        expect(out).not.toContain('Geheime');
    });

    it('liest nur Markdown-Dokumente direkt unter docs/', async () => {
        const { client } = await connect();
        expect(textOf(await client.callTool({ name: 'read_doc', arguments: {} }))).toContain(
            'Notiz.md'
        );
        expect(
            textOf(await client.callTool({ name: 'read_doc', arguments: { name: 'Notiz.md' } }))
        ).toBe('# Notiz');
        const bad = await client.callTool({
            name: 'read_doc',
            arguments: { name: '../package.json' }
        });
        expect(bad.isError).toBe(true);
    });

    it('meldet Fehler der API als Werkzeugfehler und ruft nur GET auf', async () => {
        const { client, calls } = await connect();
        const r = await client.callTool({ name: 'list_presets', arguments: { folder: 'x' } });
        expect(r.isError).toBe(true);
        await client.callTool({ name: 'list_todos', arguments: {} });
        expect(calls.every((c) => c.method === 'GET')).toBe(true);
    });

    it('legt Vorschläge nur über den Vorschlags-Endpunkt an und ändert selbst nichts', async () => {
        const { client, calls } = await connect();
        const r = await client.callTool({
            name: 'propose_mapping',
            arguments: {
                folder: '010_Account',
                sourceField: 'Industry',
                targetField: 'Branche__c',
                reason: 'Feld heißt im Ziel anders'
            }
        });
        expect(r.isError).toBeFalsy();
        expect(textOf(r)).toContain('geändert wurde noch nichts');
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/api/chat/proposals',
                body: {
                    kind: 'mapping',
                    payload: {
                        folder: '010_Account',
                        sourceField: 'Industry',
                        targetField: 'Branche__c'
                    },
                    reason: 'Feld heißt im Ziel anders'
                }
            }
        ]);
    });

    it('lehnt ungültige Vorschläge ab, bevor etwas gesendet wird', async () => {
        const { client, calls } = await connect();
        const r = await client
            .callTool({
                name: 'propose_parent_mode',
                arguments: { folder: 'x', index: 0, mode: 'delete', reason: 'x' }
            })
            .catch((e) => ({ isError: true, e }));
        expect(r.isError).toBe(true);
        expect(calls).toEqual([]);
    });
});
