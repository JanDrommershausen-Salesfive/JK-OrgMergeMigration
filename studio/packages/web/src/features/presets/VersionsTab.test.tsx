import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionsTab } from './VersionsTab';

afterEach(() => vi.unstubAllGlobals());

const preset = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    id,
    name,
    note: '',
    createdAt: '2026-10-05T12:03:07Z',
    source: 'manual',
    hasValueMapping: true,
    matchesCurrent: false,
    ...over
});

function setup(
    presets = [
        preset('2026-10-05_14-03-07_lauft', 'Läuft', { note: 'erster guter Stand' }),
        preset('2026-10-04_09-00-00_alt', 'Alt', { matchesCurrent: true })
    ]
) {
    const calls: { url: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: { body?: string }) => {
            const body = init?.body
                ? (JSON.parse(init.body) as Record<string, unknown>)
                : undefined;
            calls.push({ url, body });
            const routes: [string, unknown, number][] = [
                [
                    '/api/presets/diff',
                    {
                        changes: [
                            {
                                area: 'query',
                                text: 'Contact (Hauptobjekt): Felder hinzugefügt: Phone'
                            }
                        ]
                    },
                    200
                ],
                [
                    '/api/presets/restore',
                    { backup: preset('b', 'Vor dem Laden von Läuft', { source: 'backup' }) },
                    200
                ],
                ['/api/presets/delete', {}, 204],
                ['/api/presets', url.includes('?') ? { presets } : preset('neu', 'Neu'), 200]
            ];
            const hit = routes.find(([prefix]) => url.startsWith(prefix));
            return Promise.resolve({
                ok: !!hit,
                status: hit?.[2] ?? 404,
                json: async () => hit?.[1] ?? { error: 'x' }
            });
        })
    );
    const reports: string[] = [];
    render(
        <QueryClientProvider client={new QueryClient()}>
            <VersionsTab folder="020_Contact" running={false} report={(t) => reports.push(t)} />
        </QueryClientProvider>
    );
    return { calls, reports };
}

describe('VersionsTab', () => {
    it('listet Stände mit Notiz und markiert den aktuellen', async () => {
        setup();
        expect(await screen.findByText('Läuft')).toBeInTheDocument();
        expect(screen.getByText('erster guter Stand')).toBeInTheDocument();
        expect(screen.getByText('= aktuell')).toBeInTheDocument();
        // der aktuelle Stand lässt sich nicht erneut laden
        const buttons = screen.getAllByRole('button', { name: 'Laden …' });
        expect(buttons[0]).toBeEnabled();
        expect(buttons[1]).toBeDisabled();
    });

    it('speichert den aktuellen Stand unter einem Namen mit Notiz', async () => {
        const user = userEvent.setup();
        const { calls, reports } = setup();
        await screen.findByText('Läuft');
        await user.type(screen.getByLabelText('Name'), 'Länder gemappt');
        await user.type(screen.getByLabelText('Notiz (optional)'), 'vor dem Test');
        await user.click(screen.getByRole('button', { name: 'Speichern' }));
        await waitFor(() =>
            expect(calls.find((c) => c.url === '/api/presets' && c.body)?.body).toEqual({
                folder: '020_Contact',
                name: 'Länder gemappt',
                note: 'vor dem Test'
            })
        );
        await waitFor(() => expect(reports.some((r) => r.includes('gespeichert'))).toBe(true));
    });

    it('zeigt im Vergleich, was sich beim Laden ändert', async () => {
        const user = userEvent.setup();
        setup();
        await user.click((await screen.findAllByRole('button', { name: 'Vergleichen' }))[0]!);
        expect(
            await screen.findByText('Contact (Hauptobjekt): Felder hinzugefügt: Phone')
        ).toBeInTheDocument();
    });

    it('fragt beim Laden nach dem Backup und sichert standardmäßig vorher', async () => {
        const user = userEvent.setup();
        const { calls, reports } = setup();
        await user.click((await screen.findAllByRole('button', { name: 'Laden …' }))[0]!);
        expect(await screen.findByText('Aktuellen Stand vorher sichern?')).toBeInTheDocument();
        expect(
            await screen.findByText('Contact (Hauptobjekt): Felder hinzugefügt: Phone')
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stand laden' }));
        await waitFor(() =>
            expect(calls.find((c) => c.url === '/api/presets/restore')?.body).toEqual({
                folder: '020_Contact',
                id: '2026-10-05_14-03-07_lauft',
                backupName: 'Vor dem Laden von Läuft'
            })
        );
        await waitFor(() =>
            expect(
                reports.some((r) => r.includes('vorher gesichert als „Vor dem Laden von Läuft“'))
            ).toBe(true)
        );
    });

    it('lädt ohne Backup, wenn "Nein" gewählt ist', async () => {
        const user = userEvent.setup();
        const { calls } = setup();
        await user.click((await screen.findAllByRole('button', { name: 'Laden …' }))[0]!);
        await user.click(await screen.findByRole('radio', { name: /Nein, nicht sichern/ }));
        await user.click(screen.getByRole('button', { name: 'Stand laden' }));
        await waitFor(() => {
            const body = calls.find((c) => c.url === '/api/presets/restore')?.body;
            expect(body).toEqual({ folder: '020_Contact', id: '2026-10-05_14-03-07_lauft' });
        });
    });

    it('löscht erst nach Rückfrage', async () => {
        const user = userEvent.setup();
        const { calls } = setup();
        await user.click((await screen.findAllByRole('button', { name: 'Löschen' }))[0]!);
        expect(calls.some((c) => c.url === '/api/presets/delete')).toBe(false);
        await user.click(screen.getByRole('button', { name: 'Wirklich löschen' }));
        await waitFor(() =>
            expect(calls.find((c) => c.url === '/api/presets/delete')?.body).toEqual({
                folder: '020_Contact',
                id: '2026-10-05_14-03-07_lauft'
            })
        );
    });
});
