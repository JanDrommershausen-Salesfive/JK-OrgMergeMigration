import {
    execFile,
    spawn as nodeSpawn,
    type ChildProcess,
    type SpawnOptions
} from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatEvent, ChatStatus, Proposal, SendChatRequest } from '@studio/shared';
import { conflict } from '../errors';
import { writeFileAtomic } from '../util/fs';
import { MCP_SERVER_NAME, buildChatArgs, withContext } from './args';
import { parseStreamLine } from './parse';

export interface ChatManagerOptions {
    projectDir: string;
    studioUrl: string; // Adresse, unter der der MCP-Server das Studio erreicht
    mcpCommand: { command: string; args: string[] }; // startet den Studio-MCP-Server
    claudeBin?: string;
    spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
    timeoutMs?: number;
}

interface StoredMessage {
    role: 'user' | 'assistant';
    text: string;
    tools: { name: string; summary: string }[];
    proposals?: Proposal[];
}

interface Stored {
    sessionId: string | null;
    messages: StoredMessage[];
}

const TURN_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_HINT =
    'Claude Code ist nicht installiert oder nicht im PATH. Installation: https://claude.com/claude-code, danach einmal "claude" im Terminal starten und anmelden.';

// Ein Gespräch je Projekt. Jede Nachricht startet die Claude-CLI neu und setzt per --resume das Gespräch fort.
// Verlauf und Session-Id liegen lokal unter chat/ (nicht im Git); Ereignisse werden live an die GUI gestreamt.
export class ChatManager {
    private readonly file: string;
    private readonly bin: string;
    private readonly emitter = new EventEmitter();
    private child: ChildProcess | null = null;
    private stopped = false;
    private stored: Stored | null = null;
    private statusCache: {
        at: number;
        value: Pick<ChatStatus, 'available' | 'version' | 'hint'>;
    } | null = null;

    constructor(private readonly opts: ChatManagerOptions) {
        this.file = path.join(opts.projectDir, 'chat', 'session.json');
        this.bin = opts.claudeBin ?? 'claude';
        this.emitter.setMaxListeners(50);
    }

    get running(): boolean {
        return this.child !== null;
    }

    async status(): Promise<ChatStatus> {
        const fresh = this.statusCache && Date.now() - this.statusCache.at < 30_000;
        const value = fresh ? this.statusCache!.value : await this.probe();
        this.statusCache = { at: Date.now(), value };
        return { running: this.running, ...value };
    }

    private probe(): Promise<Pick<ChatStatus, 'available' | 'version' | 'hint'>> {
        return new Promise((resolve) => {
            execFile(this.bin, ['--version'], { timeout: 10_000 }, (err, stdout) =>
                resolve(
                    err
                        ? { available: false, version: null, hint: INSTALL_HINT }
                        : { available: true, version: stdout.trim() || null, hint: null }
                )
            );
        });
    }

    async send(req: SendChatRequest): Promise<void> {
        if (this.child) throw conflict('Claude antwortet noch.');
        const status = await this.status();
        if (!status.available) throw conflict(status.hint ?? INSTALL_HINT);
        const data = await this.load();
        const reply: StoredMessage = { role: 'assistant', text: '', tools: [] };
        data.messages.push({ role: 'user', text: req.message, tools: [] }, reply);
        this.emit({ type: 'user', text: req.message });
        const mcpConfigPath = await this.writeMcpConfig();

        const spawnFn = this.opts.spawnFn ?? nodeSpawn;
        const child = spawnFn(
            this.bin,
            buildChatArgs({ sessionId: data.sessionId, mcpConfigPath }),
            { cwd: this.opts.projectDir, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        this.child = child;
        this.stopped = false;
        const state = { deltas: false };
        let ended = false;
        let stderr = '';
        let buffer = '';

        const handle = (line: string) => {
            if (!line.trim()) return;
            const parsed = parseStreamLine(line, state);
            if (parsed.sessionId) data.sessionId = parsed.sessionId;
            for (const e of parsed.events) {
                if (e.type === 'text') reply.text += e.text;
                if (e.type === 'tool') reply.tools.push({ name: e.name, summary: e.summary });
                if (e.type === 'end') ended = true;
                this.emit(e);
            }
        };
        const finish = (event: ChatEvent) => {
            if (this.child !== child) return;
            this.child = null;
            clearTimeout(timer);
            if (!ended) this.emit(event);
            void this.save(data).catch(() => undefined);
        };

        const timer = setTimeout(() => {
            this.stopped = true;
            child.kill('SIGTERM');
        }, this.opts.timeoutMs ?? TURN_TIMEOUT_MS);
        child.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            lines.forEach(handle);
        });
        child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
        child.on('error', (err) => finish({ type: 'end', ok: false, error: err.message }));
        child.on('close', (code) => {
            handle(buffer);
            buffer = '';
            finish(
                this.stopped
                    ? { type: 'end', ok: false, error: 'Angehalten.' }
                    : {
                          type: 'end',
                          ok: code === 0,
                          ...(code === 0
                              ? {}
                              : { error: stderr.trim().slice(-500) || `Exit-Code ${code}` })
                      }
            );
        });
        child.stdin?.end(withContext(req.message, req.context));
        await this.save(data);
    }

    stop(): void {
        this.stopped = true;
        this.child?.kill('SIGTERM');
    }

    // Neues Gespräch: Verlauf und Session verwerfen.
    async reset(): Promise<void> {
        if (this.child) throw conflict('Claude antwortet noch.');
        this.stored = { sessionId: null, messages: [] };
        await this.save(this.stored);
        this.emit({ type: 'reset' });
    }

    // Bisheriger Verlauf als Ereignisse, danach live. Rückgabe: Abmelden.
    async subscribe(listener: (e: ChatEvent) => void): Promise<() => void> {
        const { messages } = await this.load();
        messages.forEach((m, i) => {
            if (m.role === 'user') return listener({ type: 'user', text: m.text });
            m.tools.forEach((t) => listener({ type: 'tool', name: t.name, summary: t.summary }));
            if (m.text) listener({ type: 'text', text: m.text });
            m.proposals?.forEach((proposal) => listener({ type: 'proposal', proposal }));
            // Die letzte Antwort ist noch im Gang, solange ein Prozess läuft.
            if (!(this.child && i === messages.length - 1)) listener({ type: 'end', ok: true });
        });
        this.emitter.on('event', listener);
        return () => this.emitter.off('event', listener);
    }

    // Ereignis von außen (Vorschläge): an die GUI senden und im Verlauf festhalten, damit es ein Neuladen übersteht.
    async publish(e: ChatEvent): Promise<void> {
        const data = await this.load();
        if (e.type === 'proposal') {
            let reply = data.messages[data.messages.length - 1];
            if (reply?.role !== 'assistant') {
                reply = { role: 'assistant', text: '', tools: [] };
                data.messages.push(reply);
            }
            (reply.proposals ??= []).push(e.proposal);
        } else if (e.type === 'proposal-status') {
            for (const m of data.messages) {
                const p = m.proposals?.find((x) => x.id === e.id);
                if (p) Object.assign(p, { status: e.status, message: e.message });
            }
        }
        this.emit(e);
        await this.save(data);
    }

    private emit(e: ChatEvent): void {
        this.emitter.emit('event', e);
    }

    private async writeMcpConfig(): Promise<string> {
        const file = path.join(this.opts.projectDir, 'chat', 'mcp.json');
        const { command, args } = this.opts.mcpCommand;
        await mkdir(path.dirname(file), { recursive: true });
        const config = {
            mcpServers: {
                [MCP_SERVER_NAME]: {
                    command,
                    args,
                    env: { STUDIO_URL: this.opts.studioUrl, STUDIO_PROJECT: this.opts.projectDir }
                }
            }
        };
        await writeFileAtomic(file, JSON.stringify(config, null, 2) + '\n');
        return file;
    }

    private async load(): Promise<Stored> {
        if (this.stored) return this.stored;
        try {
            this.stored = JSON.parse(await readFile(this.file, 'utf8')) as Stored;
        } catch {
            this.stored = { sessionId: null, messages: [] };
        }
        return this.stored;
    }

    private async save(data: Stored): Promise<void> {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFileAtomic(this.file, JSON.stringify(data, null, 2) + '\n');
    }
}
