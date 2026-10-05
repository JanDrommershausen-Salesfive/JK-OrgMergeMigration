import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunProvider } from '../features/run/RunContext';
import { OrgCleanerPage } from './OrgCleanerPage';
import { ToolsPage } from './ToolsPage';

// Der Test kann Ereignisse des Servers nachstellen (Fortschritt, Ende).
class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
    }
    close() {}
}
const serverSends = (...events: unknown[]) =>
    act(() => {
        const es = FakeEventSource.instances
            .filter((i) => i.url.includes('/tools/cleaner/'))
            .at(-1);
        for (const e of events) es?.onmessage?.({ data: JSON.stringify(e) } as MessageEvent);
    });

afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
});

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
                ['/api/tools/cleaner/reset', {}],
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
        // Der Plan-Schritt zeigt kein Formular; für Änderungen geht es zurück zur Konfiguration
        await user.click(screen.getByRole('button', { name: 'Konfiguration ändern' }));
        await user.click(
            await screen.findByRole('radio', { name: /Alle Datensätze der gewählten Objekte/ })
        );
        expect(screen.queryByText('Blocker')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Plan berechnen' })).toBeInTheDocument();
    });

    async function runToFinished(user: ReturnType<typeof userEvent.setup>) {
        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        await user.click(await screen.findByRole('button', { name: 'Löschen starten …' }));
        await user.type(await screen.findByLabelText('Alias bestätigen'), 'CDEV5');
        await user.click(screen.getByRole('button', { name: 'Jetzt in CDEV5 löschen' }));
        await waitFor(() =>
            expect(
                FakeEventSource.instances.filter((i) => i.url.includes('/tools/cleaner/')).length
            ).toBeGreaterThan(1)
        ); // Stream wird neu verbunden
        await serverSends(
            { type: 'log', text: 'Contact: 129 Datensätze\n' },
            {
                type: 'step',
                order: 1,
                object: 'Contact',
                state: 'done',
                deleted: 129,
                failed: 0,
                remaining: 0
            },
            { type: 'end', ok: true, deleted: 129, failed: 0, stopped: false }
        );
    }

    it('zeigt nach dem Löschen nur noch den Lauf und verlangt "Neuer Löschlauf" für den nächsten', async () => {
        const user = userEvent.setup();
        setup();
        await runToFinished(user);
        expect(await screen.findByRole('button', { name: 'Neuer Löschlauf' })).toBeInTheDocument();
        expect(screen.getByText(/129 gelöscht/)).toBeInTheDocument();
        // Formular und Plan sind weg, damit sich nichts vermischt
        expect(screen.queryByRole('button', { name: 'Plan berechnen' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Löschen starten …' })).not.toBeInTheDocument();
        expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Fertig');
    });

    it('"Neuer Löschlauf" setzt serverseitig zurück, öffnet den Umfang und behält die Auswahl', async () => {
        const user = userEvent.setup();
        const calls = setup();
        await user.click(await screen.findByRole('checkbox', { name: /Contact/ })); // Contact abwählen
        await runToFinished(user);
        await user.click(await screen.findByRole('button', { name: 'Neuer Löschlauf' }));
        expect(calls.some((c) => c.url === '/api/tools/cleaner/reset')).toBe(true);
        expect(await screen.findByRole('button', { name: 'Plan berechnen' })).toBeInTheDocument();
        expect(screen.queryByText(/129 gelöscht/)).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /Contact/ })).not.toBeChecked();
        expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
            'Konfiguration'
        );
    });

    it('zeigt nach einem Neuladen den letzten Lauf aus dem Puffer des Servers', async () => {
        setup();
        await screen.findByRole('button', { name: 'Plan berechnen' });
        await serverSends(
            {
                type: 'step',
                order: 2,
                object: 'Account',
                state: 'partial',
                deleted: 49,
                failed: 1,
                remaining: 1
            },
            { type: 'end', ok: false, deleted: 49, failed: 1, stopped: false }
        );
        expect(await screen.findByText(/Mit Resten beendet/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Neuer Löschlauf' })).toBeInTheDocument();
        expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('"Zurücksetzen" stellt die Voreinstellung wieder her und verwirft den Plan', async () => {
        const user = userEvent.setup();
        setup();
        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        expect(await screen.findByText('Blocker')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Konfiguration ändern' }));
        await user.click(await screen.findByRole('checkbox', { name: /Contact/ }));
        expect(screen.getByRole('checkbox', { name: /Contact/ })).not.toBeChecked();
        await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
        expect(screen.getByRole('checkbox', { name: /Contact/ })).toBeChecked();
        expect(screen.queryByText('Blocker')).not.toBeInTheDocument();
    });

    it('zeigt den Ablauf als Path mit vier Stufen und hebt die aktuelle hervor', async () => {
        const user = userEvent.setup();
        setup();
        const path = await screen.findByRole('list', { name: 'Ablauf' });
        const labels = () =>
            within(path)
                .getAllByRole('listitem')
                .map((li) => li.textContent);
        expect(labels()).toEqual(['Konfiguration', 'Plan', 'Löschen', 'Fertig']);
        expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
            'Konfiguration'
        );
        // jede Stufe hat eine kurze Hilfe wie beim Salesforce-Path
        expect(screen.getByText(/Lege fest, was gelöscht werden soll/)).toBeInTheDocument();

        await user.click(await screen.findByRole('button', { name: 'Plan berechnen' }));
        await screen.findByText('Blocker');
        expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Plan');
        expect(labels()[0]).toBe('✓ Konfiguration');
        expect(screen.getByText(/Prüfe die Reihenfolge und die Zahlen/)).toBeInTheDocument();
        // Klick auf die abgeschlossene erste Stufe führt zurück zur Konfiguration
        await user.click(screen.getByRole('button', { name: '✓ Konfiguration' }));
        expect(await screen.findByRole('button', { name: 'Plan berechnen' })).toBeInTheDocument();
    });

    it('sperrt alles, wenn das Ziel keine Sandbox ist', async () => {
        setup(false);
        expect(await screen.findByText(/ist keine Sandbox/)).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: 'Plan berechnen' })).toBeDisabled();
    });
});
