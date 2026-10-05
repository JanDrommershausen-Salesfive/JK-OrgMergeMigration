import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CohortsPage } from './CohortsPage';

afterEach(() => vi.unstubAllGlobals());

const cohort = {
    id: 'test-20-1',
    name: 'Test 20',
    createdAt: '2026-10-02T19:03:20Z',
    rootObject: 'Account',
    rule: { kind: 'sample', size: 20, filters: [] },
    ids: ['001A'],
    count: 20
};
const preview = {
    rows: [
        {
            folder: '010_Account',
            object: 'Account',
            scoped: true,
            count: 20,
            via: 'Id',
            note: null
        },
        {
            folder: '020_Contact',
            object: 'Contact',
            scoped: true,
            count: 1024,
            via: 'AccountId',
            note: null
        },
        {
            folder: '030_Product2',
            object: 'Product2',
            scoped: false,
            count: null,
            via: null,
            note: 'Kein Account-Eintrag in der Konfiguration'
        }
    ]
};

const records = {
    alias: 'us-prod',
    soql: 'x',
    columns: ['Id', 'Name', 'BillingState'],
    rows: [
        ['001A', 'The Estate', 'CA'],
        ['001B', 'Oasis Tanning', 'NY']
    ],
    totalSize: 2,
    truncated: false
};

function renderAt(path: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
            const body = url.startsWith('/api/cohorts/records')
                ? records
                : url.startsWith('/api/cohorts/preview')
                  ? preview
                  : url.startsWith('/api/cohorts')
                    ? { cohorts: [cohort] }
                    : null;
            return Promise.resolve({
                ok: !!body,
                status: body ? 200 : 404,
                json: async () => body ?? { error: 'x' }
            });
        })
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/kohorten" element={<CohortsPage />} />
                    <Route path="/kohorten/:id" element={<CohortsPage />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('CohortsPage', () => {
    it('erklärt oben, was eine Kohorte ist, und lässt sich ausblenden', async () => {
        const user = userEvent.setup();
        localStorage.clear();
        renderAt('/kohorten');
        expect(
            await screen.findByRole('region', { name: 'Was ist eine Kohorte?' })
        ).toBeInTheDocument();
        expect(screen.getByText(/feste Auswahl von Accounts/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Ausblenden' }));
        expect(
            screen.queryByRole('region', { name: 'Was ist eine Kohorte?' })
        ).not.toBeInTheDocument();
        // Der Hinweis lässt sich wieder öffnen
        await user.click(screen.getByRole('button', { name: 'Was ist eine Kohorte?' }));
        expect(screen.getByRole('region', { name: 'Was ist eine Kohorte?' })).toBeInTheDocument();
        localStorage.clear();
    });

    it('listet Kohorten mit Größe und Regel', async () => {
        renderAt('/kohorten');
        expect(await screen.findByText('Test 20')).toBeInTheDocument();
        expect(screen.getByText(/20 Account · Zufällig 20, ohne Filter/)).toBeInTheDocument();
        expect(screen.getByText('Wähle links eine Kohorte.')).toBeInTheDocument();
    });

    it('berechnet die Vorschau auf Knopfdruck und schätzt den Speicher', async () => {
        const user = userEvent.setup();
        renderAt('/kohorten/test-20-1');
        await user.click(await screen.findByRole('button', { name: 'Vorschau berechnen' }));
        expect(await screen.findByText('1024')).toBeInTheDocument();
        // 20 + 1024 Datensätze: grob 2 MB
        expect(screen.getByText('1044')).toBeInTheDocument();
        expect(screen.getByText('2 MB')).toBeInTheDocument();
        expect(screen.getByText(/Kein Account-Eintrag in der Konfiguration/)).toBeInTheDocument();
    });

    it('zeigt Zusammensetzung, Inhalt und Datensätze der Kohorte gleich beim Öffnen und filtert sie', async () => {
        const user = userEvent.setup();
        renderAt('/kohorten/test-20-1');
        expect(await screen.findByText('Zufällige Stichprobe: 20 Account')).toBeInTheDocument();
        expect(
            screen.getByText(/Ohne Filter: gezogen aus allen Accounts der Quelle/)
        ).toBeInTheDocument();
        expect(await screen.findByText('The Estate')).toBeInTheDocument();
        expect(screen.getByText('Oasis Tanning')).toBeInTheDocument();
        expect(screen.getByText(/2 Datensätze/)).toBeInTheDocument();
        // Inhalt: häufigste Werte aus den geladenen Datensätzen
        expect(
            within(screen.getByRole('region', { name: 'Inhalt' })).getByText('CA')
        ).toBeInTheDocument();
        await user.type(screen.getByLabelText('Datensätze filtern'), 'oasis');
        expect(screen.queryByText('The Estate')).not.toBeInTheDocument();
        expect(screen.getByText(/1 von 2/)).toBeInTheDocument();
    });
});
