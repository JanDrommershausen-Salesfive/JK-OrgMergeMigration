import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

const port = 4174;

describe('API', () => {
    it('antwortet auf /api/health', async () => {
        const app = await buildApp({ projectDir: '/tmp/nicht-vorhanden', port });
        const res = await app.inject({
            method: 'GET',
            url: '/api/health',
            headers: { host: `127.0.0.1:${port}` }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ status: 'ok', projectConfigured: false });
    });

    it('weist fremde Hosts ab', async () => {
        const app = await buildApp({ projectDir: '/tmp/nicht-vorhanden', port });
        const res = await app.inject({
            method: 'GET',
            url: '/api/health',
            headers: { host: 'evil.example.com' }
        });
        expect(res.statusCode).toBe(403);
    });
});
