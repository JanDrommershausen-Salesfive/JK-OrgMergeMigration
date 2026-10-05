import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ChatDrawer } from './ChatDrawer';

type Chat = Parameters<typeof ChatDrawer>[0]['chat'];
const chat = (over: Partial<Chat> = {}): Chat =>
    ({
        status: { running: false, available: true, version: '2', hint: null },
        messages: [],
        running: false,
        error: null,
        send: vi.fn(async () => undefined),
        decide: vi.fn(async () => undefined),
        stop: vi.fn(),
        reset: vi.fn(async () => undefined),
        refetchStatus: vi.fn(),
        ...over
    }) as Chat;

const renderDrawer = (c: Chat, path = '/konfiguration/010_Account/mapping') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ChatDrawer open onClose={() => undefined} chat={c} />
        </MemoryRouter>
    );

describe('ChatDrawer', () => {
    it('sendet mit Enter und gibt den Kontext der Seite mit', async () => {
        const c = chat();
        renderDrawer(c);
        await userEvent.type(screen.getByLabelText('Nachricht an Claude'), 'Was fehlt?{Enter}');
        expect(c.send).toHaveBeenCalledWith('Was fehlt?', {
            page: '/konfiguration/010_Account/mapping',
            folder: '010_Account'
        });
        expect(screen.getByText('Kontext: 010_Account')).toBeInTheDocument();
    });

    it('zeigt Antworten mit Markdown-Tabelle und Werkzeugzeile', () => {
        renderDrawer(
            chat({
                messages: [
                    { role: 'user', text: 'Liste', tools: [], proposals: [], done: true },
                    {
                        role: 'assistant',
                        text: '| A | B |\n|---|---|\n| 1 | 2 |',
                        tools: [{ name: 'list_objects', summary: 'list_objects' }],
                        proposals: [],
                        done: true
                    }
                ]
            })
        );
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.getByText(/list_objects/)).toBeInTheDocument();
    });

    it('zeigt den Hinweis bei fehlender CLI und sperrt das Senden', () => {
        renderDrawer(
            chat({
                status: {
                    running: false,
                    available: false,
                    version: null,
                    hint: 'Claude Code ist nicht installiert.'
                }
            })
        );
        expect(screen.getByRole('alert')).toHaveTextContent('nicht installiert');
        expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
    });

    it('bietet während der Antwort Anhalten statt Senden an', async () => {
        const c = chat({
            running: true,
            messages: [{ role: 'user', text: 'x', tools: [], proposals: [], done: true }]
        });
        renderDrawer(c);
        await userEvent.click(screen.getByRole('button', { name: 'Anhalten' }));
        expect(c.stop).toHaveBeenCalled();
    });

    it('zeigt Vorschläge als Karte und übernimmt oder verwirft sie erst auf Klick', async () => {
        const p = {
            id: 'p1',
            kind: 'mapping' as const,
            folder: '010_Account',
            title: 'Mapping ändern',
            details: ['Industry → Branche__c'],
            reason: 'heißt im Ziel anders',
            status: 'pending' as const,
            createdAt: 'x'
        };
        const c = chat({
            messages: [
                { role: 'assistant', text: 'Vorschlag', tools: [], proposals: [p], done: true }
            ]
        });
        renderDrawer(c);
        const card = screen.getByRole('region', { name: 'Vorschlag: Mapping ändern' });
        expect(card).toHaveTextContent('Industry → Branche__c');
        expect(c.decide).not.toHaveBeenCalled();
        await userEvent.click(within(card).getByRole('button', { name: 'Übernehmen' }));
        expect(c.decide).toHaveBeenCalledWith('p1', 'apply');
        await userEvent.click(within(card).getByRole('button', { name: 'Verwerfen' }));
        expect(c.decide).toHaveBeenCalledWith('p1', 'reject');
    });

    it('zeigt bearbeitete Vorschläge ohne Knöpfe', () => {
        const p = {
            id: 'p1',
            kind: 'mapping' as const,
            folder: 'f',
            title: 'Mapping ändern',
            details: [],
            reason: 'r',
            status: 'applied' as const,
            message: 'Übernommen. Vorher gesichert als „B“.',
            createdAt: 'x'
        };
        renderDrawer(
            chat({
                messages: [{ role: 'assistant', text: '', tools: [], proposals: [p], done: true }]
            })
        );
        expect(screen.queryByRole('button', { name: 'Übernehmen' })).not.toBeInTheDocument();
        expect(screen.getByText(/Vorher gesichert/)).toBeInTheDocument();
    });
});

describe('Abfragevorschlag', () => {
    it('öffnet den Query-Editor mit der Abfrage, statt etwas zu ändern', async () => {
        const p = {
            id: 'q1',
            kind: 'soql-query' as const,
            folder: null,
            title: 'Abfrage in der Quelle im Query-Editor öffnen',
            details: ['SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState'],
            reason: 'alle State-Werte',
            status: 'pending' as const,
            createdAt: 'x'
        };
        const c = chat({
            messages: [{ role: 'assistant', text: '', tools: [], proposals: [p], done: true }]
        });
        renderDrawer(c);
        expect(screen.queryByRole('button', { name: 'Übernehmen' })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Im Query-Editor öffnen' }));
        expect(c.decide).toHaveBeenCalledWith('q1', 'apply');
    });
});
