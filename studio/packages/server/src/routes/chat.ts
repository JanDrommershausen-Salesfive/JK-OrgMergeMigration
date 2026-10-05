import {
    CreateProposalRequestSchema,
    ProposalIdRequestSchema,
    SendChatRequestSchema
} from '@studio/shared';
import type { ChatManager, ChatProposals } from '@studio/core';
import type { FastifyPluginAsync } from 'fastify';

// Chat mit Claude: Status, Nachricht senden, Ereignisse als Stream, anhalten, neues Gespräch.
export const chatRoutes: FastifyPluginAsync<{
    chat: ChatManager;
    proposals: ChatProposals;
}> = async (app, { chat, proposals }) => {
    app.get('/chat', () => chat.status());
    app.post('/chat/send', async (req, reply) => {
        await chat.send(SendChatRequestSchema.parse(req.body));
        return reply.code(202).send(await chat.status());
    });
    app.post('/chat/stop', async (_req, reply) => {
        chat.stop();
        return reply.code(204).send();
    });
    app.post('/chat/reset', async (_req, reply) => {
        await chat.reset();
        return reply.code(204).send();
    });
    // Claude legt Vorschläge an (über den MCP-Server); übernommen oder verworfen werden sie nur aus der GUI.
    app.post('/chat/proposals', (req) =>
        proposals.create(CreateProposalRequestSchema.parse(req.body))
    );
    app.post('/chat/proposals/apply', (req) =>
        proposals.apply(ProposalIdRequestSchema.parse(req.body).id)
    );
    app.post('/chat/proposals/reject', (req) =>
        proposals.reject(ProposalIdRequestSchema.parse(req.body).id)
    );
    app.get('/chat/events', async (req, reply) => {
        reply.hijack();
        const res = reply.raw;
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        const unsubscribe = await chat.subscribe((event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        req.raw.on('close', unsubscribe);
    });
};
