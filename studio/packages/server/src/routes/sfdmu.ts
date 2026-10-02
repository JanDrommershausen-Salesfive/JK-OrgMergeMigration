import {
    ExcludeRequestSchema,
    MappingRequestSchema,
    StartRunRequestSchema,
    ValueMappingRequestSchema
} from '@studio/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Studio } from '@studio/core';

const FolderQuery = z.object({ folder: z.string() });
const DescribeQuery = FolderQuery.extend({ refresh: z.enum(['0', '1']).optional() });

// Objekte, Felder, Mappings und Orgs. Die Routen validieren nur und rufen Studio auf.
export const sfdmuRoutes: FastifyPluginAsync<{ studio: Studio }> = async (app, { studio }) => {
    app.get('/objects', () => studio.objects());
    app.get('/object', (req) => studio.object(FolderQuery.parse(req.query).folder));
    app.get('/describe', (req) => {
        const q = DescribeQuery.parse(req.query);
        return studio.describe(q.folder, q.refresh === '1');
    });
    app.get('/orgs', () => studio.orgs());

    app.post('/mapping', (req) => studio.setMapping(MappingRequestSchema.parse(req.body)));
    app.post('/exclude', (req) => studio.setExcluded(ExcludeRequestSchema.parse(req.body)));
    app.post('/valuemapping', (req) =>
        studio.setValueMapping(ValueMappingRequestSchema.parse(req.body))
    );

    app.get('/run', () => studio.runStatus());
    app.post('/run', async (req, reply) => {
        const { folder, mode } = StartRunRequestSchema.parse(req.body);
        await studio.startRun(folder, mode);
        return reply.code(202).send(studio.runStatus());
    });
    app.post('/stop', async (_req, reply) => {
        studio.stopRun();
        return reply.code(204).send();
    });

    // Server-Sent Events: erst das bisherige Log, dann Live-Ereignisse bis zum Ende des Laufs.
    app.get('/run/events', (req, reply) => {
        reply.hijack();
        const res = reply.raw;
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        const unsubscribe = studio.subscribeRun((event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            if (event.type === 'end') res.end();
        });
        req.raw.on('close', unsubscribe);
    });
};
