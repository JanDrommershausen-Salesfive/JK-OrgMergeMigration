import { EventEmitter } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChatEvent } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { buildChatArgs, withContext } from './args';
import { ChatManager } from './manager';
import { parseStreamLine } from './parse';

describe('buildChatArgs', () => {
    it('erlaubt nur Studio-Werkzeuge und lädt keine Nutzer- oder Projekteinstellungen', () => {
        const args = buildChatArgs({ sessionId: null, mcpConfigPath: '/x/mcp.json' });
        const at = (flag: string) => args[args.indexOf(flag) + 1];
        expect(at('--tools')).toBe('');
        expect(at('--allowedTools')).toBe('mcp__studio__*');
        expect(args).toContain('--strict-mcp-config');
        expect(at('--setting-sources')).toBe('');
        expect(args).not.toContain('--resume');
    });

    it('setzt ein Gespräch mit --resume fort', () => {
        const args = buildChatArgs({ sessionId: 'abc', mcpConfigPath: '/x' });
        expect(args.slice(-2)).toEqual(['--resume', 'abc']);
    });
});

describe('withContext', () => {
    it('stellt den Kontext der Oberfläche voran', () => {
        expect(
            withContext('Hallo', {
                page: '/konfiguration/010_Account/mapping',
                folder: '010_Account'
            })
        ).toBe(
            '[Kontext der Oberfläche: Seite: /konfiguration/010_Account/mapping, Objekt: 010_Account]\n\nHallo'
        );
        expect(withContext('Hallo')).toBe('Hallo');
    });
});

describe('parseStreamLine', () => {
    const line = (o: unknown) => JSON.stringify(o);
    it('übersetzt Textstücke, Werkzeugaufrufe und das Ende', () => {
        const state = { deltas: false };
        const delta = parseStreamLine(
            line({
                type: 'stream_event',
                session_id: 's1',
                event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }
            }),
            state
        );
        expect(delta).toEqual({ sessionId: 's1', events: [{ type: 'text', text: 'ok' }] });
        const tool = parseStreamLine(
            line({
                type: 'assistant',
                message: {
                    content: [
                        {
                            type: 'tool_use',
                            name: 'mcp__studio__get_object_config',
                            input: { folder: '010_Account' }
                        },
                        { type: 'text', text: 'ok' }
                    ]
                }
            }),
            state
        );
        expect(tool.events).toEqual([
            { type: 'tool', name: 'get_object_config', summary: 'get_object_config (010_Account)' }
        ]); // Text kam schon als Stück
        expect(
            parseStreamLine(line({ type: 'result', is_error: false, result: 'ok' }), state).events
        ).toEqual([{ type: 'end', ok: true }]);
        expect(
            parseStreamLine(
                line({ type: 'result', is_error: true, result: 'Nicht angemeldet' }),
                state
            ).events
        ).toEqual([{ type: 'end', ok: false, error: 'Nicht angemeldet' }]);
    });

    it('nimmt den Text der fertigen Nachricht, wenn keine Stücke kamen, und ignoriert Müll', () => {
        const state = { deltas: false };
        expect(
            parseStreamLine(
                line({
                    type: 'assistant',
                    message: { content: [{ type: 'text', text: 'Hallo' }] }
                }),
                state
            ).events
        ).toEqual([{ type: 'text', text: 'Hallo' }]);
        expect(parseStreamLine('kein json', state).events).toEqual([]);
    });
});

// Ersatz für die CLI: schreibt vorbereitete Zeilen und beendet sich.
function fakeSpawn(lines: unknown[], code = 0, delayMs = 5) {
    const calls: { args: string[]; stdin: string }[] = [];
    const fn = (_cmd: string, args: string[]) => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: PassThrough;
            stderr: PassThrough;
            stdin: PassThrough;
            kill: () => void;
        };
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new PassThrough();
        child.kill = () => child.emit('close', null);
        const call = { args, stdin: '' };
        calls.push(call);
        child.stdin.on('data', (d: Buffer) => (call.stdin += d.toString()));
        child.stdin.on('end', () =>
            setTimeout(() => {
                for (const l of lines) child.stdout.write(JSON.stringify(l) + '\n');
                child.emit('close', code);
            }, delayMs)
        );
        return child;
    };
    return { fn: fn as never, calls };
}
const ok = [
    { type: 'system', subtype: 'init', session_id: 'sess-1' },
    {
        type: 'stream_event',
        session_id: 'sess-1',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hal' } }
    },
    {
        type: 'stream_event',
        session_id: 'sess-1',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }
    },
    { type: 'result', is_error: false, session_id: 'sess-1', result: 'Hallo' }
];

async function manager(spawn: ReturnType<typeof fakeSpawn>) {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'chat-'));
    const m = new ChatManager({
        projectDir,
        studioUrl: 'http://127.0.0.1:4174',
        mcpCommand: { command: 'node', args: ['mcp.ts'] },
        spawnFn: spawn.fn,
        claudeBin: process.execPath
    });
    return { m, projectDir };
}
const collect = async (m: ChatManager) => {
    const events: ChatEvent[] = [];
    const unsub = await m.subscribe((e) => events.push(e));
    return { events, unsub };
};
const until = async (events: ChatEvent[], type: string) => {
    for (let i = 0; i < 200 && !events.some((e) => e.type === type); i++)
        await new Promise((r) => setTimeout(r, 10));
};

describe('ChatManager', () => {
    it('streamt die Antwort, merkt sich die Session und setzt mit --resume fort', async () => {
        const spawn = fakeSpawn(ok);
        const { m, projectDir } = await manager(spawn);
        const { events } = await collect(m);
        await m.send({ message: 'Hi', context: { folder: '010_Account' } });
        await until(events, 'end');
        expect(events.map((e) => e.type)).toEqual(['user', 'text', 'text', 'end']);
        expect(spawn.calls[0]!.stdin).toContain('Objekt: 010_Account');
        expect(spawn.calls[0]!.args).not.toContain('--resume');

        await new Promise((r) => setTimeout(r, 20));
        await m.send({ message: 'Und?' });
        expect(spawn.calls[1]!.args.slice(-2)).toEqual(['--resume', 'sess-1']);
        const stored = JSON.parse(
            await readFile(path.join(projectDir, 'chat', 'session.json'), 'utf8')
        );
        expect(stored.messages[1].text).toBe('Hallo');
        const cfg = JSON.parse(await readFile(path.join(projectDir, 'chat', 'mcp.json'), 'utf8'));
        expect(cfg.mcpServers.studio.env.STUDIO_URL).toBe('http://127.0.0.1:4174');
    });

    it('spielt den Verlauf neuen Zuhörern vor und setzt mit reset zurück', async () => {
        const spawn = fakeSpawn(ok);
        const { m } = await manager(spawn);
        const first = await collect(m);
        await m.send({ message: 'Hi' });
        await until(first.events, 'end');
        await new Promise((r) => setTimeout(r, 20));
        const late = await collect(m);
        expect(late.events.map((e) => e.type)).toEqual(['user', 'text', 'end']);
        await m.reset();
        expect((await collect(m)).events).toEqual([]);
        expect(late.events.at(-1)).toEqual({ type: 'reset' });
    });

    it('meldet Fehler der CLI und erlaubt keine zweite Nachricht während einer Antwort', async () => {
        const spawn = fakeSpawn([], 1, 150);
        const { m } = await manager(spawn);
        const { events } = await collect(m);
        await m.send({ message: 'Hi' });
        await expect(m.send({ message: 'noch eine' })).rejects.toThrow(/antwortet noch/);
        await until(events, 'end');
        expect(events.at(-1)).toMatchObject({ type: 'end', ok: false });
    });

    it('meldet eine fehlende CLI mit Hinweis', async () => {
        const projectDir = await mkdtemp(path.join(os.tmpdir(), 'chat-'));
        const m = new ChatManager({
            projectDir,
            studioUrl: 'x',
            mcpCommand: { command: 'n', args: [] },
            claudeBin: '/gibt/es/nicht'
        });
        expect(await m.status()).toMatchObject({ available: false });
        await expect(m.send({ message: 'Hi' })).rejects.toThrow(/nicht installiert/);
    });
});
