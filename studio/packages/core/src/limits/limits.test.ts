import { describe, expect, it } from 'vitest';
import type { SfRunner } from '../orgs/sf';
import { levelOf, parseLimits, readOrgLimits } from './index';

const rows = [
    { name: 'DailyApiRequests', max: 170000, remaining: 169462 },
    { name: 'DailyBulkApiBatches', max: 15000, remaining: 600 },
    { name: 'DataStorageMB', max: 200, remaining: 183 },
    { name: 'FileStorageMB', max: 200, remaining: 8 },
    { name: 'Sonstiges', max: 10, remaining: 10 }
];

describe('Org-Limits', () => {
    it('nimmt nur die beobachteten Limits und rechnet Verbrauch und Anteil', () => {
        const limits = parseLimits(rows);
        expect(limits.map((l) => l.key)).toEqual([
            'DailyApiRequests',
            'DailyBulkApiBatches',
            'DataStorageMB',
            'FileStorageMB'
        ]);
        expect(limits[0]).toMatchObject({ used: 538, percentUsed: 0.3, level: 'ok' });
        expect(limits[2]).toMatchObject({ used: 17, percentUsed: 8.5 });
    });

    it('stuft Limits nach Auslastung ein', () => {
        expect(levelOf(79.9)).toBe('ok');
        expect(levelOf(80)).toBe('warn');
        expect(levelOf(95)).toBe('crit');
        const byKey = Object.fromEntries(parseLimits(rows).map((l) => [l.key, l.level]));
        expect(byKey).toMatchObject({
            DailyBulkApiBatches: 'crit',
            FileStorageMB: 'crit',
            DataStorageMB: 'ok'
        });
    });

    it('liest eine Org mit einem sf-Aufruf und meldet Fehler lesbar', async () => {
        const calls: string[][] = [];
        const ok: SfRunner = async (args) => {
            calls.push(args);
            return { status: 0, result: rows };
        };
        const res = await readOrgLimits('target', 'CDEV5', ok);
        expect(calls).toEqual([['limits', 'api', 'display', '-o', 'CDEV5']]);
        expect(res).toMatchObject({ role: 'target', alias: 'CDEV5', error: null });

        const bad: SfRunner = async () => ({
            status: 1,
            message: '\nNo authorization information found'
        });
        expect(await readOrgLimits('source', 'x', bad)).toMatchObject({
            limits: [],
            error: 'No authorization information found'
        });
    });
});
