import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChatEvent } from '@studio/shared';
import { describe, expect, it, vi } from 'vitest';
import { ChatManager } from './manager';
import { ChatProposals, describeProposal } from './proposals';
import type { Studio } from '../studio';

function setup(over: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const studio = {
        object: vi.fn(async (folder: string) => {
            if (folder === 'nope') throw new Error('Unbekanntes Objekt.');
            return {};
        }),
        listTodos: vi.fn(async () => ({ items: [{ id: 't1' }] })),
        backupIfUnsaved: vi.fn(async () => {
            calls.push('backup');
            return 'Vor Chat-Änderung';
        }),
        setMapping: vi.fn(async () => void calls.push('setMapping')),
        changeQueryFields: vi.fn(async () => void calls.push('changeQueryFields')),
        updateTodo: vi.fn(async () => void calls.push('updateTodo')),
        ...over
    };
    const events: ChatEvent[] = [];
    const proposals = new ChatProposals(studio as unknown as Studio, (e) => events.push(e));
    return { studio, proposals, events, calls };
}
const mapping = {
    kind: 'mapping' as const,
    payload: { folder: '010_Account', sourceField: 'Industry', targetField: 'Branche__c' },
    reason: 'heißt anders'
};

describe('describeProposal', () => {
    it('beschreibt Vorschläge verständlich', () => {
        expect(
            describeProposal('query-fields', { folder: 'f', add: ['A', 'B'], remove: ['C'] })
        ).toEqual({
            folder: 'f',
            title: 'Query: Felder ändern',
            details: ['Hinzufügen: A, B', 'Entfernen: C']
        });
        expect(
            describeProposal('value-mapping', {
                folder: 'f',
                field: 'Country',
                rows: [{ from: 'US', to: 'USA' }]
            })
        ).toMatchObject({
            title: expect.stringContaining('1 Regeln'),
            details: ['US → USA']
        });
        expect(
            describeProposal('query-filters', {
                folder: 'f',
                filters: [{ field: 'A', op: '=', value: { kind: 'string', value: 'x' } }]
            }).details
        ).toEqual(["A = 'x'"]);
    });
});

describe('ChatProposals', () => {
    it('legt Vorschläge an, ohne zu ändern', async () => {
        const { proposals, events, calls } = setup();
        const p = await proposals.create(mapping);
        expect(p).toMatchObject({
            status: 'pending',
            folder: '010_Account',
            title: 'Mapping ändern',
            details: ['Industry → Branche__c']
        });
        expect(events).toEqual([{ type: 'proposal', proposal: p }]);
        expect(calls).toEqual([]);
    });

    it('prüft Eingabe, Objekt und To-Do', async () => {
        const { proposals } = setup();
        await expect(
            proposals.create({ ...mapping, payload: { folder: '010_Account' } })
        ).rejects.toThrow();
        await expect(
            proposals.create({ ...mapping, payload: { ...mapping.payload, folder: 'nope' } })
        ).rejects.toThrow(/Unbekannt/);
        await expect(
            proposals.create({
                kind: 'todo-status',
                payload: { id: 'x', status: 'done' },
                reason: 'r'
            })
        ).rejects.toThrow(/To-Do/);
    });

    it('sichert beim Übernehmen zuerst und ändert dann', async () => {
        const { proposals, events, calls } = setup();
        const p = await proposals.create(mapping);
        const done = await proposals.apply(p.id);
        expect(calls).toEqual(['backup', 'setMapping']);
        expect(done).toMatchObject({
            status: 'applied',
            message: expect.stringContaining('Vor Chat-Änderung')
        });
        expect(events.at(-1)).toMatchObject({
            type: 'proposal-status',
            id: p.id,
            status: 'applied'
        });
        await expect(proposals.apply(p.id)).rejects.toThrow(/schon bearbeitet/);
    });

    it('meldet Fehler beim Übernehmen als fehlgeschlagen', async () => {
        const { proposals } = setup({
            setMapping: vi.fn(async () => {
                throw new Error('Während eines Laufs nicht möglich.');
            })
        });
        const p = await proposals.create(mapping);
        expect(await proposals.apply(p.id)).toMatchObject({
            status: 'failed',
            message: 'Während eines Laufs nicht möglich.'
        });
    });

    it('sichert bei To-Do-Änderungen nicht und kann verwerfen', async () => {
        const { proposals, calls } = setup();
        const t = await proposals.create({
            kind: 'todo-status',
            payload: { id: 't1', status: 'done' },
            reason: 'r'
        });
        await proposals.apply(t.id);
        expect(calls).toEqual(['updateTodo']);
        const p = await proposals.create(mapping);
        expect(proposals.reject(p.id)).toMatchObject({ status: 'rejected' });
        expect(calls).toEqual(['updateTodo']);
    });

    it('kennt unbekannte Ids nicht', async () => {
        const { proposals } = setup();
        await expect(proposals.apply('gibt-es-nicht')).rejects.toThrow(/Unbekannter Vorschlag/);
    });
});

describe('ChatManager.publish', () => {
    it('hält Vorschläge im Verlauf und spielt sie mit aktuellem Status wieder vor', async () => {
        const projectDir = await mkdtemp(path.join(os.tmpdir(), 'chat-'));
        const m = new ChatManager({
            projectDir,
            studioUrl: 'x',
            mcpCommand: { command: 'n', args: [] }
        });
        const { proposals } = setup();
        const proposal = await proposals.create(mapping);
        await m.publish({ type: 'proposal', proposal });
        await m.publish({
            type: 'proposal-status',
            id: proposal.id,
            status: 'applied',
            message: 'ok'
        });
        const replay: ChatEvent[] = [];
        await m.subscribe((e) => replay.push(e));
        expect(replay.find((e) => e.type === 'proposal')).toMatchObject({
            proposal: { id: proposal.id, status: 'applied', message: 'ok' }
        });
    });
});
