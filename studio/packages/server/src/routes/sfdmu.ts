import {
    ExcludeRequestSchema,
    LoginRequestSchema,
    MappingRequestSchema,
    SelectOrgsRequestSchema,
    StartRunRequestSchema,
    ValueMappingRequestSchema
} from '@studio/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Studio } from '@studio/core';

const FolderQuery = z.object({ folder: z.string() });
const RunQuery = FolderQuery.extend({ id: z.string() });
const ExportQuery = RunQuery.extend({ kind: z.enum(['errors', 'missing-parents']) });
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
    app.get('/orgs/available', () => studio.availableOrgs());
    app.post('/orgs/login', (req) => studio.login(LoginRequestSchema.parse(req.body)));
    app.post('/orgs/select', (req) => studio.selectOrgs(SelectOrgsRequestSchema.parse(req.body)));

    app.post('/mapping', (req) => studio.setMapping(MappingRequestSchema.parse(req.body)));
    app.post('/exclude', (req) => studio.setExcluded(ExcludeRequestSchema.parse(req.body)));
    app.post('/valuemapping', (req) =>
        studio.setValueMapping(ValueMappingRequestSchema.parse(req.body))
    );

    app.get('/results/all', () => studio.allRuns());
    app.get('/results', (req) => studio.runResults(FolderQuery.parse(req.query).folder));
    app.get('/results/run', (req) => {
        const q = RunQuery.parse(req.query);
        return studio.runDetail(q.folder, q.id);
    });
    app.get('/results/log', async (req) => {
        const q = RunQuery.parse(req.query);
        return { log: await studio.runLog(q.folder, q.id) };
    });
    app.get('/results/export', async (req, reply) => {
        const q = ExportQuery.parse(req.query);
        const file = await studio.exportRun(q.folder, q.id, q.kind);
        return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${file.filename}"`)
            .send(file.text);
    });

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
