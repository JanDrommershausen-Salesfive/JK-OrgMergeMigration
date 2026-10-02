import { loadProject } from '@studio/core';
import type { HealthResponse } from '@studio/shared';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync<{ projectDir: string }> = async (app, opts) => {
    app.get('/health', async (): Promise<HealthResponse> => {
        const project = await loadProject(opts.projectDir);
        return {
            status: 'ok',
            version: '0.1.0',
            projectDir: opts.projectDir,
            projectConfigured: project !== null
        };
    });
};
