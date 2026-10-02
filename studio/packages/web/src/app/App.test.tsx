import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

class FakeEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null;
    close() {}
}

afterEach(() => vi.unstubAllGlobals());

const objects = {
    objects: [
        {
            folder: '020_Contact',
            object: 'Contact',
            operation: 'Upsert',
            externalId: 'Email',
            readonlyParents: [],
            lastRun: null
        }
    ],
    running: false,
    sourceAlias: 'us-prod',
    targetAlias: 'CDEV5'
};
const detail = { ...objects.objects[0], where: null, valueMappings: [], fields: [] };

describe('App', () => {
    it('zeigt Objektliste und Detail', async () => {
        vi.stubGlobal('EventSource', FakeEventSource);
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                const body = url.startsWith('/api/objects')
                    ? objects
                    : url.startsWith('/api/object?')
                      ? detail
                      : url.startsWith('/api/run')
                        ? { running: false, folder: null, mode: null }
                        : null;
                return Promise.resolve(
                    body
                        ? { ok: true, json: async () => body }
                        : { ok: false, status: 500, json: async () => ({ error: 'egal' }) }
                );
            })
        );
        render(
            <QueryClientProvider client={new QueryClient()}>
                <App />
            </QueryClientProvider>
        );
        expect(await screen.findByRole('heading', { name: 'Contact' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Simulation starten/ })).toBeInTheDocument();
    });
});
