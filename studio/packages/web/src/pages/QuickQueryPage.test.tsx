import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickQueryPage } from './QuickQueryPage';

afterEach(() => vi.unstubAllGlobals());

const objects = {
    objects: [
        {
            folder: '010_Account',
            object: 'Account',
            operation: 'Upsert',
            externalId: 'Name',
            readonlyParents: [],
            fieldCount: 1,
            valueMappingCount: 0,
            lastRun: null
        }
    ],
    running: false,
    configured: true,
    staleProjectPath: null,
    sourceAlias: 'us-prod',
    targetAlias: 'CDEV5'
};
const result = {
    alias: 'us-prod',
    soql: 'SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState LIMIT 5000',
    columns: ['BillingState', 'expr0'],
    rows: [
        ['CA', '40'],
        ['NY', '7'],
        ['', '3']
    ],
    totalSize: 3,
    truncated: false
};

function setup(url = '/tools/query', jumpTo?: string) {
    const fetchMock = vi.fn(async (u: string, init?: RequestInit) => {
        const path = String(u);
        if (path === '/api/objects') return new Response(JSON.stringify(objects));
        if (path === '/api/tools/query') return new Response(JSON.stringify(result));
        if (path.startsWith('/api/object?'))
            return new Response(
                JSON.stringify({
                    ...objects.objects[0],
                    parentIndex: null,
                    where: null,
                    fields: [],
                    valueMappings: [{ field: 'BillingState', from: 'CA', to: 'California' }]
                })
            );
        if (path === '/api/valuemapping')
            return new Response(
                JSON.stringify({
                    ...objects.objects[0],
                    parentIndex: null,
                    where: null,
                    fields: [],
                    valueMappings: []
                })
            );
        return new Response('{}', { status: 404, ...(init ? {} : {}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <MemoryRouter initialEntries={[url]}>
                {jumpTo && <Jump to={jumpTo} />}
                <QuickQueryPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
    return fetchMock;
}

function Jump({ to }: { to: string }) {
    const navigate = useNavigate();
    return <button onClick={() => navigate(to)}>Vorschlag öffnen</button>;
}

describe('QuickQueryPage', () => {
    it('lädt eine vorgeschlagene Abfrage in den Editor, führt aber nichts von selbst aus', async () => {
        const f = setup('/tools/query?org=target&soql=SELECT%20Id%20FROM%20Account');
        expect(await screen.findByLabelText('SOQL')).toHaveValue('SELECT Id FROM Account');
        expect(screen.getByLabelText('Org')).toHaveValue('target');
        expect(f.mock.calls.some(([u]) => String(u) === '/api/tools/query')).toBe(false);
    });

    it('führt aus und zeigt die Werte mit Häufigkeit', async () => {
        const f = setup();
        await userEvent.type(
            await screen.findByLabelText('SOQL'),
            'SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Ausführen' }));
        const values = await screen.findByRole('region', { name: 'Werte' });
        expect(within(values).getByText('3 verschiedene')).toBeInTheDocument();
        expect(within(values).getByText('40')).toBeInTheDocument();
        const call = f.mock.calls.find(([u]) => String(u) === '/api/tools/query')!;
        expect(JSON.parse(String(call[1]!.body))).toMatchObject({ org: 'source' });
    });

    it('übernimmt neue Quellwerte ins Wertemapping und lässt bestehende Regeln stehen', async () => {
        const f = setup();
        await userEvent.type(
            await screen.findByLabelText('SOQL'),
            'SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Ausführen' }));
        const values = await screen.findByRole('region', { name: 'Werte' });
        await userEvent.selectOptions(within(values).getByLabelText('Objekt'), '010_Account');
        await userEvent.click(
            within(values).getByRole('button', { name: 'Quellwerte übernehmen' })
        );
        expect(await screen.findByText(/1 neue Quellwerte übernommen/)).toBeInTheDocument();
        const call = f.mock.calls.find(([u]) => String(u) === '/api/valuemapping')!;
        expect(JSON.parse(String(call[1]!.body))).toEqual({
            folder: '010_Account',
            field: 'BillingState',
            rows: [
                { from: 'CA', to: 'California' },
                { from: 'NY', to: 'NY' }
            ]
        });
    });

    it('übernimmt einen Vorschlag auch, wenn die Seite schon offen ist', async () => {
        setup('/tools/query', '/tools/query?org=target&soql=SELECT%20Name%20FROM%20Contact');
        const box = await screen.findByLabelText('SOQL');
        await userEvent.type(box, 'SELECT Id FROM Account');
        await userEvent.click(screen.getByRole('button', { name: 'Vorschlag öffnen' }));
        expect(screen.getByLabelText('SOQL')).toHaveValue('SELECT Name FROM Contact');
        expect(screen.getByLabelText('Org')).toHaveValue('target');
    });
});
