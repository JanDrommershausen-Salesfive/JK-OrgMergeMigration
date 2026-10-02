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
    configured: true,
    staleProjectPath: null,
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
                const body = url.startsWith('/api/orgs')
                    ? {
                          source: {
                              connected: true,
                              alias: 'us-prod',
                              orgId: '00D1',
                              name: 'US',
                              isSandbox: false,
                              instance: 'EU1',
                              instanceUrl: null,
                              username: 'a',
                              idMatches: true
                          },
                          target: {
                              connected: true,
                              alias: 'CDEV5',
                              orgId: '00D2',
                              name: 'EU',
                              isSandbox: true,
                              instance: 'EU2',
                              instanceUrl: null,
                              username: 'b',
                              idMatches: true
                          },
                          checkedAt: 'x'
                      }
                    : url.startsWith('/api/objects')
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

    it('fordert ohne Projektorgs zur Auswahl auf', async () => {
        vi.stubGlobal('EventSource', FakeEventSource);
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) =>
                Promise.resolve(
                    url.startsWith('/api/objects')
                        ? {
                              ok: true,
                              json: async () => ({
                                  ...objects,
                                  configured: false,
                                  sourceAlias: '',
                                  targetAlias: ''
                              })
                          }
                        : url.startsWith('/api/run')
                          ? {
                                ok: true,
                                json: async () => ({ running: false, folder: null, mode: null })
                            }
                          : {
                                ok: false,
                                status: 409,
                                json: async () => ({ error: 'Noch keine Orgs ausgewählt.' })
                            }
                )
            )
        );
        render(
            <QueryClientProvider client={new QueryClient()}>
                <App />
            </QueryClientProvider>
        );
        expect(await screen.findByRole('button', { name: 'Orgs auswählen' })).toBeInTheDocument();
    });
});
