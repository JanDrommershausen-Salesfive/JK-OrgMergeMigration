import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunProvider } from '../features/run/RunContext';
import { OrgCleanerPage } from './OrgCleanerPage';
import { ToolsPage } from './ToolsPage';

class FakeEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null;
    close() {}
}

afterEach(() => vi.unstubAllGlobals());

const objects = {
    objects: [
        {
            folder: '010_Account',
            object: 'Account',
            operation: 'Upsert',
            externalId: 'Name',
            readonlyParents: [],
            lastRun: null
        },
        {
            folder: '020_Contact',
            object: 'Contact',
            operation: 'Upsert',
            externalId: 'Email',
            readonlyParents: [],
            lastRun: null
        }
    ],
    running: false,
    configured: true,
    staleProjectPath: null,
    sourceAlias: 'us-prod',
    targetAlias: 'CDEV5'
};
const org = (alias: string, isSandbox: boolean) => ({
    connected: true,
    alias,
    orgId: '00D1',
    name: alias,
    isSandbox,
    instance: 'EU',
    instanceUrl: null,
    username: 'jan@cdev5',
    idMatches: true
});
const plan = {
    alias: 'CDEV5',
    username: 'jan@cdev5',
    createdAt: 'x',
    scope: { creator: 'me' },
    steps: [
        {
            order: 1,
            object: 'Contact',
            label: 'Contact',
            reason: 'migration',
            blocks: null,
            where: "CreatedById = '005'",
            count: 129,
            prepare: null,
            note: null
        },
        {
            order: 2,
            object: 'Entitlement',
            label: 'Entitlement',
            reason: 'blocker',
            blocks: 'Account',
            where: 'x',
            count: 50,
            prepare: null,
            note: 'verhindert das Löschen von Account (automatisch angelegt)'
        },
        {
            order: 3,
            object: 'Account',
            label: 'Account',
            reason: 'migration',
            blocks: null,
            where: "CreatedById = '005'",
            count: 50,
            prepare: null,
            note: null
        }
    ],
    warnings: [],
    total: 229
};

function setup(sandbox = true) {
    const calls: { url: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: { body?: string }) => {
            const body = init?.body
                ? (JSON.parse(init.body) as Record<string, unknown>)
                : undefined;
            calls.push({ url, body });
            const routes: [string, unknown][] = [
                ['/api/objects', objects],
                [
                    '/api/orgs',
                    { source: org('us-prod', false), target: org('CDEV5', sandbox), checkedAt: 'x' }
                ],
                [
                    '/api/tools/cleaner/rules',
                    {
                        exclude: [],
                        blockers: [
                            {
                                object: 'Entitlement',
                                field: 'AccountId',
                                blocks: 'Account',
                                anyCreator: true,
                                note: 'automatisch angelegt'
                            }
                        ]
                    }
                ],
                ['/api/tools/cleaner/status', { running: false }],
                ['/api/tools/cleaner/plan', plan],
                ['/api/tools/cleaner/start', { running: true }],
                ['/api/run', { running: false, folder: null, mode: null }]
            ];
            const hit = routes.find(([prefix]) => url.startsWith(prefix));
            return Promise.resolve({
                ok: !!hit,
                status: hit ? 200 : 404,
                json: async () => (hit ? hit[1] : { error: 'x' })
            });
        })
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <RunProvider>
                    <OrgCleanerPage />
                </RunProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
    return calls;
}

describe('ToolsPage', () => {
    it('zeigt den Org Cleaner als Kachel mit Link und weitere Werkzeuge als "bald"', () => {
        render(
            <MemoryRouter>
                <ToolsPage />
            </MemoryRouter>
        );
        expect(screen.getByRole('link', { name: /Org Cleaner/ })).toHaveAttribute(
            'href',
            '/tools/org-cleaner'
        );
        expect(screen.getAllByText('bald').length).toBeGreaterThan(0);
    });
});

describe('OrgCleanerPage', () => {
    it('berechnet den Plan mit Standardumfang "von mir angelegt" und zeigt Blocker', async () => {
        const user = userEvent.setup();
        const calls = setup();
        expect(
            await screen.findByText(/Projektregeln aus cleaner.config.json/)
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Nur von mir angelegte/ })).toBeChecked();
        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        expect(await screen.findByText('Blocker')).toBeInTheDocument();
        expect(screen.getByText(/Zusammen/)).toHaveTextContent('229');
        const body = calls.find((c) => c.url === '/api/tools/cleaner/plan')?.body;
        expect(body).toMatchObject({
            objects: ['Account', 'Contact'],
            scope: { creator: 'me', since: null },
            includeBlockers: true,
            blockersAnyCreator: false
        });
    });

    it('löscht erst nach Eintippen des Alias und schickt Plan-Einstellungen mit', async () => {
        const user = userEvent.setup();
        const calls = setup();
        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        await user.click(await screen.findByRole('button', { name: 'Löschen starten …' }));
        const confirm = await screen.findByRole('button', { name: 'Jetzt in CDEV5 löschen' });
        expect(confirm).toBeDisabled();
        await user.type(screen.getByLabelText('Alias bestätigen'), 'cdev5'); // falsche Schreibweise
        expect(confirm).toBeDisabled();
        await user.clear(screen.getByLabelText('Alias bestätigen'));
        await user.type(screen.getByLabelText('Alias bestätigen'), 'CDEV5');
        expect(confirm).toBeEnabled();
        await user.click(confirm);
        await waitFor(() => {
            const body = calls.find((c) => c.url === '/api/tools/cleaner/start')?.body;
            expect(body).toMatchObject({
                confirm: 'CDEV5',
                hardDelete: true,
                scope: { creator: 'me' },
                objects: ['Account', 'Contact']
            });
        });
    });

    it('verwirft den Plan, wenn der Umfang danach geändert wird', async () => {
        const user = userEvent.setup();
        setup();
        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        expect(await screen.findByText('Blocker')).toBeInTheDocument();
        await user.click(
            screen.getByRole('radio', { name: /Alle Datensätze der gewählten Objekte/ })
        );
        expect(screen.queryByText('Blocker')).not.toBeInTheDocument();
    });

    it('sperrt alles, wenn das Ziel keine Sandbox ist', async () => {
        setup(false);
        expect(await screen.findByText(/ist keine Sandbox/)).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: 'Plan berechnen' })).toBeDisabled();
    });
});
