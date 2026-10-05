import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const run = { folder: '020_Contact', id: '1', at: '2026-10-05T10:00:00Z' };
const todo = (object: string, status: string) => ({
    id: `${object}${status}`,
    object,
    folder: '020_Contact',
    category: 'required',
    field: 'LastName',
    apiField: 'LastName',
    message: 'Pflichtfeld',
    suggestion: `Vorschlag ${object}`,
    step: 'mapping',
    status,
    note: '',
    count: 2,
    examples: [],
    firstRun: run,
    lastRun: run,
    createdAt: run.at,
    updatedAt: run.at
});

class FakeEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null;
    close() {}
}

afterEach(() => vi.unstubAllGlobals());

const step = async (name: RegExp) =>
    within(await screen.findByRole('navigation', { name: 'Konfigurationsschritte' })).getByRole(
        'link',
        { name }
    );

const lastRun = {
    at: '2026-10-02T16:29:44.338Z',
    mode: 'simulation',
    ok: true,
    stopped: false,
    inserted: 29,
    updated: 19,
    errors: 0,
    missingParents: 37,
    runId: '2026-10-02T16-29-33Z'
};
const contact = {
    folder: '020_Contact',
    object: 'Contact',
    operation: 'Upsert',
    externalId: 'Email',
    readonlyParents: [],
    lastRun
};
const objects = {
    objects: [contact],
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
    instance: 'EU1',
    instanceUrl: null,
    username: 'u',
    idMatches: true
});
const meta = {
    id: lastRun.runId,
    folder: '020_Contact',
    object: 'Contact',
    mode: 'simulation',
    startedAt: lastRun.at,
    endedAt: lastRun.at,
    durationMs: 4000,
    ok: true,
    stopped: false,
    exitCode: 0,
    signal: null,
    sourceAlias: 'us-prod',
    targetAlias: 'CDEV5',
    counts: { inserted: 29, updated: 19, deleted: 0, errors: 0, missingParents: 37, warnings: 1 },
    summary: [],
    warnings: [],
    logErrors: []
};

const routes: Record<string, unknown> = {
    '/api/objects': objects,
    '/api/object?': { ...contact, parentIndex: null, where: null, valueMappings: [], fields: [] },
    '/api/orgs': { source: org('us-prod', false), target: org('CDEV5', true), checkedAt: 'x' },
    '/api/run': { running: false, folder: null, mode: null },
    '/api/results/all': { runs: [meta] },
    '/api/results/run': {
        meta,
        errors: [],
        errorsTotal: 0,
        missingParents: [],
        missingParentsTotal: 0,
        missingParentGroups: []
    },
    '/api/presets': { presets: [] },
    '/api/todos': {
        items: [todo('Contact', 'open'), todo('Contact', 'done'), todo('Account', 'open')]
    },
    '/api/describe': { source: { ok: false, error: 'x' }, target: { ok: false, error: 'x' } }
};

function renderAt(path: string, override: Record<string, unknown> = {}) {
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
            const all = { ...routes, ...override };
            const key = Object.keys(all).find((k) => url.startsWith(k));
            return Promise.resolve(
                key
                    ? { ok: true, json: async () => all[key] }
                    : {
                          ok: false,
                          status: 409,
                          json: async () => ({ error: 'Noch keine Orgs ausgewählt.' })
                      }
            );
        })
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={[path]}>
                <App />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('App', () => {
    it('zeigt in der Übersicht den letzten Lauf je Objekt', async () => {
        renderAt('/');
        expect(await screen.findByRole('link', { name: /020 · Contact/ })).toBeInTheDocument();
        expect(await screen.findByText('37')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Starten' })).toBeInTheDocument();
    });

    it('zeigt die Konfiguration unter /konfiguration/… mit Lauf-Leiste und Versionsknopf', async () => {
        renderAt('/konfiguration/020_Contact/mapping');
        expect(await screen.findByRole('heading', { name: 'Contact' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Contact-Lauf starten' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Version:/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Wertemapping/ })).toBeInTheDocument();
    });

    it('öffnet ein Objekt auf der Übersicht und leitet alte Adressen um', async () => {
        renderAt('/konfiguration/020_Contact');
        expect(await step(/Übersicht/)).toHaveAttribute('aria-current', 'page');
        expect(
            screen.getByRole('region', { name: 'Konfiguration auf einen Blick' })
        ).toBeInTheDocument();
    });

    it('leitet die alten Adressen /felder und /versionen um', async () => {
        renderAt('/konfiguration/020_Contact/felder');
        expect(await step(/Mapping/)).toHaveAttribute('aria-current', 'page');
    });

    it('öffnet die Versionen in der Seitenleiste', async () => {
        renderAt('/konfiguration/020_Contact/uebersicht');
        await userEvent.click(await screen.findByRole('button', { name: /Version:/ }));
        expect(await screen.findByRole('dialog', { name: 'Versionen' })).toHaveAttribute(
            'aria-hidden',
            'false'
        );
    });

    it('zeigt die offenen To-Dos des Objekts am Knopf und in der Seitenleiste', async () => {
        renderAt('/konfiguration/020_Contact/uebersicht');
        await userEvent.click(await screen.findByRole('button', { name: 'To-Dos (1)' }));
        const drawer = await screen.findByRole('dialog', { name: 'To-Dos' });
        expect(within(drawer).getAllByRole('listitem')).toHaveLength(1); // nur offen, nur Contact
        await userEvent.click(within(drawer).getByRole('checkbox', { name: /auch erledigte/ }));
        expect(within(drawer).getAllByRole('listitem')).toHaveLength(2);
    });

    it('öffnet das Terminal aus der Navigation in einer Seitenleiste', async () => {
        renderAt('/laeufe');
        const drawer = await screen.findByLabelText('Terminal', { selector: 'aside' });
        expect(drawer).toHaveAttribute('aria-hidden', 'true');
        await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
        expect(drawer).toHaveAttribute('aria-hidden', 'false');
        expect(within(drawer).getByText('Noch kein Lauf gestartet.')).toBeInTheDocument();
    });

    it('führt per Weiter durch die Schritte', async () => {
        renderAt('/konfiguration/020_Contact/uebersicht');
        await userEvent.click(await screen.findByRole('button', { name: 'Setup starten' }));
        expect(await step(/Query/)).toHaveAttribute('aria-current', 'page');
    });

    it('zeigt unter /laeufe den Lauf mit klickbaren Kacheln', async () => {
        renderAt('/laeufe/020_Contact/2026-10-02T16-29-33Z');
        expect(await screen.findByRole('button', { name: /Fehlende Parents/ })).toBeInTheDocument();
        expect(screen.getByText(/Simulation: zeigt, was geschrieben würde/)).toBeInTheDocument();
    });

    it('fordert ohne Projektorgs zur Auswahl auf', async () => {
        renderAt('/', {
            '/api/objects': { ...objects, configured: false, sourceAlias: '', targetAlias: '' }
        });
        expect(await screen.findByText(/noch keine Orgs festgelegt/)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Orgs auswählen' }).length).toBeGreaterThan(0);
    });
});
