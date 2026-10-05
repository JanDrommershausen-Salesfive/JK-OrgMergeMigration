import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LimitsPage } from './LimitsPage';

afterEach(() => vi.unstubAllGlobals());

const limit = (
    key: string,
    label: string,
    unit: string,
    max: number,
    used: number,
    level: string
) => ({
    key,
    label,
    unit,
    hint: 'Hinweis',
    max,
    remaining: max - used,
    used,
    percentUsed: Math.round((used / max) * 1000) / 10,
    level
});
const body = {
    checkedAt: '2026-10-05T12:00:00Z',
    orgs: [
        {
            role: 'source',
            alias: 'us-prod',
            error: null,
            limits: [limit('DailyApiRequests', 'API-Aufrufe (24 h)', 'Aufrufe', 170000, 538, 'ok')]
        },
        {
            role: 'target',
            alias: 'CDEV5',
            error: null,
            limits: [
                limit('FileStorageMB', 'Dateispeicher', 'MB', 200, 192, 'crit'),
                limit('DataStorageMB', 'Datenspeicher', 'MB', 200, 17, 'ok')
            ]
        }
    ]
};

function setup(data: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: async () => data }))
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <LimitsPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('LimitsPage', () => {
    it('zeigt Verbrauch je Org und warnt vor knappen Limits', async () => {
        setup(body);
        expect(await screen.findByText(/538 von 170\.000 Aufrufe/)).toBeInTheDocument();
        expect(screen.getByText(/192 von 200 MB \(96 %\)/)).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Dateispeicher in CDEV5');
        expect(screen.getByText('fast erschöpft')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Dateispeicher' })).toHaveAttribute(
            'aria-valuenow',
            '96'
        );
    });

    it('zeigt keine Warnung, wenn alles im grünen Bereich ist, und Fehler je Org', async () => {
        const ok = {
            ...body,
            orgs: [
                { ...body.orgs[0] },
                {
                    role: 'target',
                    alias: 'CDEV5',
                    limits: [],
                    error: 'No authorization information found'
                }
            ]
        };
        setup(ok);
        expect(await screen.findByText(/538 von 170\.000/)).toBeInTheDocument();
        expect(screen.getByText('No authorization information found')).toBeInTheDocument();
        expect(screen.queryByText(/Knapp oder fast erschöpft/)).not.toBeInTheDocument();
    });
});
