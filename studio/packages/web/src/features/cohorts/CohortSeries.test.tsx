import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cohort } from '@studio/shared';
import { CohortList } from './CohortList';
import { NewSeriesDialog } from './NewSeriesDialog';

afterEach(() => vi.unstubAllGlobals());

const block = (i: number, total: number, count = 500): Cohort => ({
    id: `alle-${i}`,
    name: `Alle Accounts ${i}/${total}`,
    createdAt: '2026-10-05T10:00:00Z',
    rootObject: 'Account',
    rule: { kind: 'ids', ids: ['001A'] },
    ids: ['001A'],
    count,
    series: { id: 's1', name: 'Alle Accounts', index: i, total, filters: [] }
});
const single: Cohort = {
    ...block(1, 1),
    id: 'solo',
    name: 'Test 20',
    count: 20,
    series: undefined,
    rule: { kind: 'sample', size: 20, filters: [] }
};

describe('CohortList', () => {
    it('fasst Serien zu einem Eintrag zusammen und zeigt Einzelkohorten daneben', () => {
        render(
            <MemoryRouter initialEntries={['/kohorten']}>
                <CohortList cohorts={[single, block(2, 3), block(1, 3), block(3, 3, 331)]} />
            </MemoryRouter>
        );
        expect(screen.getByText('Test 20')).toBeInTheDocument();
        expect(screen.getByText('Alle Accounts')).toBeInTheDocument();
        expect(screen.getByText(/Serie · 3 Kohorten · 1\.331 Account/)).toBeInTheDocument();
        // Blöcke stehen in der Reihenfolge ihrer Nummer
        const names = screen
            .getAllByRole('link')
            .map((l) => l.textContent ?? '')
            .filter((t) => t.startsWith('Alle Accounts'))
            .map((t) => t.slice(0, 17));
        expect(names).toEqual(['Alle Accounts 1/3', 'Alle Accounts 2/3', 'Alle Accounts 3/3']);
    });

    it('klappt die Serie auf, wenn ein Block gewählt ist', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/kohorten/alle-2']}>
                <Routes>
                    <Route
                        path="/kohorten/:id"
                        element={<CohortList cohorts={[block(1, 3), block(2, 3), block(3, 3)]} />}
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(container.querySelector('details')!.open).toBe(true);
    });
});

function setup() {
    const fetchMock = vi.fn(async (url: string) => {
        const body = String(url).endsWith('/series/preview')
            ? { total: 18831, blocks: 38, lastBlock: 331 }
            : String(url).endsWith('/series')
              ? { seriesId: 's1', blocks: 38, total: 18831, firstCohortId: 'alle-1' }
              : { source: { ok: false, error: 'x' }, target: { ok: false, error: 'x' } };
        return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <NewSeriesDialog
                open
                rootObject="Account"
                onClose={() => undefined}
                onCreated={onCreated}
            />
        </QueryClientProvider>
    );
    return { fetchMock, onCreated };
}
const bodyOf = (f: ReturnType<typeof vi.fn>, suffix: string) =>
    JSON.parse(String(f.mock.calls.find(([u]) => String(u).endsWith(suffix))![1].body));

describe('NewSeriesDialog', () => {
    it('zeigt erst die Vorschau und legt die Serie danach an', async () => {
        const { fetchMock, onCreated } = setup();
        const create = screen.getByRole('button', { name: 'Serie anlegen' });
        expect(create).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
        await screen.findByText(/37 × 500/);
        expect(screen.getByText(/37 × 500, der letzte Block mit 331/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: '38 Kohorten anlegen' }));
        expect(bodyOf(fetchMock, '/series')).toEqual({
            name: 'Alle Accounts',
            blockSize: 500,
            filters: []
        });
        await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith('alle-1'));
    });

    it('verlangt nach einer Änderung eine neue Vorschau', async () => {
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
        await screen.findByText(/37 × 500/);
        const size = screen.getByRole('spinbutton');
        await userEvent.clear(size);
        await userEvent.type(size, '100');
        expect(screen.queryByText(/37 × 500/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Vorschau' })).toBeInTheDocument();
    });

    it('nimmt eine eigene Id-Liste mit', async () => {
        const { fetchMock } = setup();
        await userEvent.click(screen.getByLabelText('Eigene Id-Liste'));
        await userEvent.type(
            screen.getByRole('textbox', { name: /Ids/ }),
            '001Dn00000PuJWbIAN 001Dn00000PsQaIIAV'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
        await screen.findByText(/37 × 500/);
        expect(bodyOf(fetchMock, '/series/preview')).toEqual({
            blockSize: 500,
            filters: [],
            ids: ['001Dn00000PuJWbIAN', '001Dn00000PsQaIIAV']
        });
    });
});
