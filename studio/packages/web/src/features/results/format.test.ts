import type { RunMeta } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { formatDuration, hasFindings } from './format';

const run = (over: Partial<RunMeta> = {}, counts: Partial<RunMeta['counts']> = {}): RunMeta => ({
    id: 'x',
    folder: 'f',
    object: 'o',
    mode: 'simulation',
    startedAt: '',
    endedAt: '',
    durationMs: 0,
    ok: true,
    stopped: false,
    exitCode: 0,
    signal: null,
    sourceAlias: '',
    targetAlias: '',
    counts: {
        inserted: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        missingParents: 0,
        warnings: 0,
        ...counts
    },
    summary: [],
    warnings: [],
    logErrors: [],
    ...over
});

describe('format', () => {
    it('formatiert Dauer', () => {
        expect(formatDuration(3547)).toBe('4 s');
        expect(formatDuration(125000)).toBe('2 min 5 s');
    });

    it('erkennt Auffälligkeiten', () => {
        expect(hasFindings(run())).toBe(false);
        expect(hasFindings(run({ ok: false }))).toBe(true);
        expect(hasFindings(run({}, { missingParents: 1 }))).toBe(true);
    });
});
