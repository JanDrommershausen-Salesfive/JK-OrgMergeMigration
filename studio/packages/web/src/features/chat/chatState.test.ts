import { describe, expect, it } from 'vitest';
import { applyChatEvent, chatContext, type ChatMessage } from './chatState';

const apply = (events: Parameters<typeof applyChatEvent>[1][]) =>
    events.reduce<ChatMessage[]>((m, e) => applyChatEvent(m, e), []);

describe('applyChatEvent', () => {
    it('baut aus den Ereignissen Nutzer- und Antwortnachricht', () => {
        const m = apply([
            { type: 'user', text: 'Hi' },
            { type: 'tool', name: 'list_objects', summary: 'list_objects' },
            { type: 'text', text: 'Hal' },
            { type: 'text', text: 'lo' },
            { type: 'end', ok: true }
        ]);
        expect(m).toEqual([
            { role: 'user', text: 'Hi', tools: [], proposals: [], done: true },
            {
                role: 'assistant',
                text: 'Hallo',
                tools: [{ name: 'list_objects', summary: 'list_objects' }],
                proposals: [],
                done: true
            }
        ]);
    });

    it('lässt eine Antwort offen bis zum Ende und merkt Fehler', () => {
        const open = apply([
            { type: 'user', text: 'Hi' },
            { type: 'text', text: 'Ha' }
        ]);
        expect(open[1]).toMatchObject({ done: false });
        const failed = applyChatEvent(open, { type: 'end', ok: false, error: 'Nicht angemeldet' });
        expect(failed[1]).toMatchObject({ done: true, error: 'Nicht angemeldet' });
    });

    it('beginnt nach der nächsten Nutzernachricht eine neue Antwort und setzt mit reset zurück', () => {
        const m = apply([
            { type: 'user', text: 'a' },
            { type: 'text', text: 'A' },
            { type: 'end', ok: true },
            { type: 'user', text: 'b' },
            { type: 'text', text: 'B' }
        ]);
        expect(m.map((x) => x.text)).toEqual(['a', 'A', 'b', 'B']);
        expect(applyChatEvent(m, { type: 'reset' })).toEqual([]);
    });
});

const proposal = {
    id: 'p1',
    kind: 'mapping' as const,
    folder: '010_Account',
    title: 'Mapping ändern',
    details: [],
    reason: 'r',
    status: 'pending' as const,
    createdAt: 'x'
};

describe('Vorschläge', () => {
    it('hängt Vorschläge an die Antwort und aktualisiert ihren Status', () => {
        const m = apply([
            { type: 'user', text: 'a' },
            { type: 'text', text: 'Ich schlage vor' },
            { type: 'proposal', proposal },
            { type: 'end', ok: true },
            { type: 'proposal-status', id: 'p1', status: 'applied', message: 'Übernommen.' }
        ]);
        expect(m).toHaveLength(2);
        expect(m[1]!.proposals).toEqual([
            { ...proposal, status: 'applied', message: 'Übernommen.' }
        ]);
    });

    it('legt für einen Vorschlag ohne Text eine Antwort an', () => {
        const m = apply([
            { type: 'user', text: 'a' },
            { type: 'proposal', proposal },
            { type: 'end', ok: true }
        ]);
        expect(m[1]).toMatchObject({ role: 'assistant', text: '', done: true });
        expect(m[1]!.proposals).toHaveLength(1);
    });
});

describe('chatContext', () => {
    it('liest Objekt und Lauf aus der Adresse', () => {
        expect(chatContext('/konfiguration/010_Account/mapping')).toEqual({
            page: '/konfiguration/010_Account/mapping',
            folder: '010_Account'
        });
        expect(chatContext('/laeufe/020_Contact/2026-10-02T16-29-33Z')).toMatchObject({
            folder: '020_Contact',
            runId: '2026-10-02T16-29-33Z'
        });
        expect(chatContext('/tools')).toEqual({ page: '/tools' });
    });
});
