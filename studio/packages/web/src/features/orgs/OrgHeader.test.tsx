import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrgHeader } from './OrgHeader';

afterEach(() => vi.unstubAllGlobals());

const expired = {
    connected: false,
    alias: 'us-prod',
    error: 'expired access/refresh token',
    instanceUrl: 'https://x.my.salesforce.com',
    username: 'a@b.c'
};
const target = {
    connected: true,
    alias: 'CDEV5',
    orgId: '00D000000000001',
    name: 'T',
    isSandbox: true,
    instance: 'CS1',
    instanceUrl: null,
    username: 'u',
    idMatches: true
};

describe('OrgHeader', () => {
    it('bietet bei abgelaufener Anmeldung "Neu anmelden" an und lädt danach den Status', async () => {
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
            (void init, String(url) === '/api/orgs/relogin')
                ? new Response(
                      JSON.stringify({
                          source: { ...target, alias: 'us-prod', isSandbox: false },
                          target,
                          checkedAt: 'x'
                      })
                  )
                : new Response(JSON.stringify({ source: expired, target, checkedAt: 'x' }))
        );
        vi.stubGlobal('fetch', fetchMock);
        render(
            <QueryClientProvider
                client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
            >
                <OrgHeader
                    configured
                    staleProjectPath={null}
                    sourceAlias="us-prod"
                    targetAlias="CDEV5"
                    running={false}
                    onChangeOrgs={() => undefined}
                />
            </QueryClientProvider>
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Neu anmelden' }));
        const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/orgs/relogin')!;
        expect(JSON.parse(String(call[1]!.body))).toEqual({ role: 'source' });
        expect(await screen.findAllByText('verbunden')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: 'Neu anmelden' })).not.toBeInTheDocument();
    });
});
