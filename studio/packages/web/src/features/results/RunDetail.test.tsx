import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunDetail } from './RunDetail';

afterEach(() => vi.unstubAllGlobals());

const detail = {
    meta: {
        id: 'r1',
        folder: '010_Account',
        object: 'Account',
        mode: 'live',
        startedAt: '2026-10-27T17:35:03.298Z',
        endedAt: '2026-10-27T17:37:06.304Z',
        durationMs: 123006,
        ok: true,
        stopped: false,
        exitCode: 0,
        signal: null,
        sourceAlias: 'src',
        targetAlias: 'tgt',
        counts: { inserted: 2, updated: 4, deleted: 0, errors: 0, missingParents: 0, warnings: 0 },
        summary: [
            {
                object: 'Account',
                processed: 6,
                passes: [{ pass: 1, inserted: 2, updated: 0, deleted: 0 }]
            }
        ],
        warnings: [],
        logErrors: []
    },
    errors: [],
    errorsTotal: 0,
    missingParents: [],
    missingParentsTotal: 0,
    missingParentGroups: [],
    inserted: [
        { file: 'insert', id: '001A', oldId: '001SRC1', label: 'Glo Tanning' },
        { file: 'insert', id: '001B', oldId: '001SRC2', label: 'Sun Tan City' }
    ],
    insertedTotal: 2,
    updated: [{ file: 'update', id: '001A', oldId: '001SRC1', label: '' }],
    updatedTotal: 1
};

function setup(body = detail) {
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body }))
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <RunDetail folder="010_Account" id="r1" />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('RunDetail', () => {
    it('zeigt unter "Eingefügt" die erfolgreichen Datensätze mit CSV-Export', async () => {
        setup();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /Eingefügt/ }));
        expect(screen.getByText('Glo Tanning')).toBeInTheDocument();
        expect(screen.getByText('001SRC2')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'CSV exportieren' });
        expect(link).toHaveAttribute(
            'href',
            '/api/results/export?folder=010_Account&id=r1&kind=inserted'
        );
    });

    it('erklärt bei "Aktualisiert", warum weniger Zeilen als Aktualisierungen erscheinen', async () => {
        setup();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /Aktualisiert/ }));
        expect(
            screen.getByText(/letzten Durchlaufs \(1\).*4 Aktualisierungen gezählt/)
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'CSV exportieren' })).toHaveAttribute(
            'href',
            '/api/results/export?folder=010_Account&id=r1&kind=updated'
        );
    });

    it('bietet keinen Export, wenn nichts eingefügt wurde, und führt zur Zusammenfassung zurück', async () => {
        setup({ ...detail, inserted: [], insertedTotal: 0 });
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /Eingefügt/ }));
        expect(screen.getByText('Keine Datensätze.')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'CSV exportieren' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Zusammenfassung' }));
        expect(screen.getByText('Durchlauf')).toBeInTheDocument();
    });
});
