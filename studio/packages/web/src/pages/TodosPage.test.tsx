import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodosPage } from './TodosPage';

afterEach(() => vi.unstubAllGlobals());

const run = { folder: '010_Account', id: '1', at: '2026-10-05T10:24:00Z' };
const item = (id: string, status: string) => ({
    id,
    object: 'Account',
    folder: '010_Account',
    category: 'state-invalid',
    field: 'Billing State/Province',
    apiField: 'BillingState',
    message: 'There is a problem with this state',
    suggestion: 'Wertemapping anlegen.',
    step: 'werte',
    status,
    note: '',
    count: 3,
    examples: [{ label: 'The Estate', id: '001A' }],
    firstRun: run,
    lastRun: run,
    createdAt: run.at,
    updatedAt: run.at
});

function setup(items: unknown[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ items })))
    );
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <MemoryRouter>
                <TodosPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('TodosPage', () => {
    it('zeigt offene Einträge mit Kategorie, Anzahl, Vorschlag und Link', async () => {
        setup([item('a', 'open'), item('b', 'done')]);
        expect(await screen.findByText('Ungültiger State')).toBeInTheDocument();
        expect(screen.getByText('3×')).toBeInTheDocument();
        expect(screen.queryByText(/Wertemapping anlegen/)).not.toBeInTheDocument(); // erst nach dem Aufklappen
        await userEvent.click(screen.getByRole('button', { name: 'Details anzeigen' }));
        expect(screen.getByText(/Wertemapping anlegen/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Zur Konfiguration/ })).toHaveAttribute(
            'href',
            '/konfiguration/010_Account/werte?feld=BillingState'
        );
        expect(screen.getByText('1 Einträge')).toBeInTheDocument(); // erledigte sind ausgeblendet
    });

    it('wechselt den Status mit einem Klick', async () => {
        setup([item('a', 'open')]);
        const group = await screen.findByRole('group', { name: /Status Account/ });
        expect(within(group).getByRole('button', { name: 'Offen' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        await userEvent.click(within(group).getByRole('button', { name: 'Erledigt' }));
        const call = vi
            .mocked(fetch)
            .mock.calls.find(([u]) => String(u).endsWith('/api/todos/update'));
        expect(JSON.parse(String(call![1]!.body))).toEqual({ id: 'a', status: 'done' });
    });

    it('erklärt eine leere Liste', async () => {
        setup([]);
        expect(await screen.findByText(/Noch nichts übernommen/)).toBeInTheDocument();
    });
});
