import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ChatManager, ChatProposals, StudioError, Studio } from '@studio/core';
import { ZodError } from 'zod';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chatRoutes } from './routes/chat';
import { healthRoutes } from './routes/health';
import { sfdmuRoutes } from './routes/sfdmu';

export interface AppOptions {
    projectDir: string;
    webDist?: string;
    port: number;
}

export async function buildApp({ projectDir, webDist, port }: AppOptions) {
    const app = Fastify({ logger: false });

    // Nur lokale Zugriffe: Host und Origin müssen auf diesen Rechner zeigen.
    const local = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    app.addHook('onRequest', async (req, reply) => {
        const origin = req.headers.origin;
        const hostOk = local.has(req.headers.host ?? '') || isViteDev(`http://${req.headers.host}`);
        const originOk = !origin || local.has(new URL(origin).host) || isViteDev(origin);
        if (!hostOk || !originOk) return reply.code(403).send({ error: 'Zugriff nicht erlaubt' });
    });

    // Fachliche Fehler und ungültige Eingaben als {error} mit passendem Status.
    app.setErrorHandler((err, _req, reply) => {
        if (err instanceof StudioError) return reply.code(err.status).send({ error: err.message });
        if (err instanceof ZodError) return reply.code(400).send({ error: 'Ungültige Anfrage.' });
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    });

    await app.register(healthRoutes, { prefix: '/api', projectDir });
    const studio = await Studio.open(projectDir).catch((err: Error) => {
        console.warn(`Projekt nicht geladen: ${err.message}`);
        return null;
    });
    if (studio) {
        await app.register(sfdmuRoutes, { prefix: '/api', studio });
        const chat = chatManager(projectDir, port);
        const proposals = new ChatProposals(studio, (e) => void chat.publish(e));
        await app.register(chatRoutes, { prefix: '/api', chat, proposals });
    }

    if (webDist && existsSync(webDist)) {
        await app.register(fastifyStatic, { root: path.resolve(webDist) });
        // Die GUI hat eigene URLs (/laeufe/…): alles außer /api liefert index.html.
        app.setNotFoundHandler((req, reply) => {
            if (req.method === 'GET' && !req.url.startsWith('/api')) {
                return reply.sendFile('index.html');
            }
            return reply.code(404).send({ error: 'Nicht gefunden' });
        });
    }
    return app;
}

// Vite-Entwicklungsserver (nur lokal) darf die API über seinen Proxy erreichen.
function isViteDev(origin: string): boolean {
    return /^http:\/\/(127\.0\.0\.1|localhost):5173$/.test(origin);
}

// Der Chat startet die Claude-CLI, die den Studio-MCP-Server per stdio nutzt (TypeScript über tsx).
function chatManager(projectDir: string, port: number): ChatManager {
    const mcpEntry = fileURLToPath(new URL('../../mcp/src/index.ts', import.meta.url));
    return new ChatManager({
        projectDir,
        studioUrl: `http://127.0.0.1:${port}`,
        mcpCommand: {
            command: process.execPath,
            args: ['--import', tsxLoader(), mcpEntry]
        }
    });
}

// Lader, mit dem Node TypeScript-Dateien startet (aus dem installierten tsx).
function tsxLoader(): string {
    const pkg = createRequire(import.meta.url).resolve('tsx/package.json');
    return pathToFileURL(path.join(path.dirname(pkg), 'dist', 'loader.mjs')).href;
}
