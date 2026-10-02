import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

class FakeEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null;
    close() {}
}

afterEach(() => vi.unstubAllGlobals());

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
    '/api/object?': { ...contact, where: null, valueMappings: [], fields: [] },
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

    it('zeigt die Konfiguration unter /konfiguration/…', async () => {
        renderAt('/konfiguration/020_Contact/felder');
        expect(await screen.findByRole('heading', { name: 'Contact' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lauf starten' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Wertemapping/ })).toBeInTheDocument();
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
