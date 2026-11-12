import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRun } from './useRun';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onmessage: ((msg: { data: string }) => void) | null = null;
    closed = false;
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    close() {
        this.closed = true;
    }
    emit(event: unknown) {
        this.onmessage?.({ data: JSON.stringify(event) });
    }
}

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
        {children}
    </QueryClientProvider>
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useRun: Start während ein Lauf aktiv ist', () => {
    it('ersetzt das Log nicht, sondern setzt die Meldung davor und holt das gepufferte Log erneut', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) =>
                init?.method === 'POST'
                    ? json(
                          {
                              error: 'Während eines Laufs oder Löschauftrags ist das nicht möglich.'
                          },
                          409
                      )
                    : json({ running: true, folder: '110_OrderItem', mode: 'live' })
            )
        );
        const { result } = renderHook(() => useRun(), { wrapper });
        expect(FakeEventSource.instances).toHaveLength(1);

        await act(async () => {
            await result.current.start('110_OrderItem', 'live');
        });

        // Neuer Stream, der alte ist geschlossen; der Server liefert darüber das Log nach.
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(FakeEventSource.instances[0]?.closed).toBe(true);
        await act(async () => {
            FakeEventSource.instances[1]?.emit({ type: 'log', text: 'Bulk API V1 Upload läuft\n' });
        });
        await waitFor(() => {
            expect(result.current.log).toContain('Während eines Laufs');
            expect(result.current.log).toContain('Bulk API V1 Upload läuft');
        });
        expect(result.current.log.indexOf('Während eines Laufs')).toBeLessThan(
            result.current.log.indexOf('Bulk API V1')
        );
    });

    it('zeigt die Fehlermeldung unverändert, wenn kein Lauf aktiv ist', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) =>
                init?.method === 'POST'
                    ? json({ error: 'Quelle und Ziel müssen verbunden sein.' }, 409)
                    : json({ running: false, folder: null, mode: null })
            )
        );
        const { result } = renderHook(() => useRun(), { wrapper });
        await act(async () => {
            await result.current.start('110_OrderItem', 'live');
        });
        expect(result.current.log).toBe('Quelle und Ziel müssen verbunden sein.');
        expect(FakeEventSource.instances).toHaveLength(1);
    });
});
