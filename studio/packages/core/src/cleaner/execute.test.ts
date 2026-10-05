import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CleanEvent, CleanPlan, CleanStep } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import type { SfResult, SfRunner } from '../orgs/sf';
import type { QueryRunner } from '../query/check';
import { executePlan, readOutcome } from './execute';

const step = (order: number, label: string, over: Partial<CleanStep> = {}): CleanStep => ({
    order,
    object: label,
    label,
    reason: 'migration',
    blocks: null,
    where: '',
    count: 1,
    prepare: null,
    note: null,
    ...over
});
const plan = (steps: CleanStep[]): CleanPlan => ({
    alias: 'CDEV5',
    username: 'u',
    createdAt: 'x',
    scope: { creator: 'me' },
    steps,
    warnings: [],
    total: 0
});

// Simuliertes Ziel: Objekt → Ids. Account lässt sich erst löschen, wenn keine Cases mehr existieren.
function fakeOrg(initial: Record<string, string[]>) {
    const data: Record<string, string[]> = JSON.parse(JSON.stringify(initial));
    const calls: string[][] = [];
    const queries: string[] = [];
    let job = 0;
    const failedByJob = new Map<string, string[]>();
    const run: QueryRunner = async (_alias, soql) => {
        queries.push(soql);
        const obj = /FROM (\w+)/.exec(soql)?.[1] ?? '';
        if (obj === 'OrderStatus') {
            return {
                records: [{ ApiName: soql.includes("'Draft'") ? 'Draft' : 'Activated' }],
                totalSize: 1
            };
        }
        const ids = data[obj] ?? [];
        if (soql.startsWith('SELECT COUNT()')) return { records: [], totalSize: ids.length };
        return { records: ids.map((Id) => ({ Id })), totalSize: ids.length };
    };
    const sf: SfRunner = async (args, opts) => {
        calls.push(args);
        if (args[1] === 'bulk' && args[0] === 'data' && args[2] === 'results') {
            const id = args[args.indexOf('-i') + 1] as string;
            const failedIds: string[] = failedByJob.get(id) ?? [];
            if (failedIds.length) {
                await writeFile(
                    path.join(opts?.cwd ?? '.', `${id}-failed-records.csv`),
                    `"sf__Id","sf__Error",Id\n${failedIds.map((f) => `"${f}","ENTITY_IS_DELETED:x","${f}"`).join('\n')}\n`
                );
            }
            return {
                status: 0,
                result: {
                    processedRecords: Number(args[args.indexOf('-i') + 1]?.split('-')[1] ?? 0),
                    failedRecords: failedIds.length,
                    failedFilePath: `${id}-failed-records.csv`
                }
            };
        }
        const verb = args[1] as string; // delete | update
        const object = args[args.indexOf('-s') + 1] as string;
        const file = args[args.indexOf('-f') + 1] as string;
        const sent = (await readFile(file, 'utf8'))
            .trim()
            .split('\n')
            .slice(1)
            .map((l) => l.split(',')[0] as string);
        if (verb === 'update') return { status: 0, result: { jobInfo: { id: `upd-${++job}` } } };
        const blocked = object === 'Account' && (data.Case ?? []).length > 0;
        const id = `job-${sent.length}-${++job}`;
        failedByJob.set(id, blocked ? sent : []);
        if (!blocked) data[object] = (data[object] ?? []).filter((x) => !sent.includes(x));
        return blocked
            ? ({
                  status: 1,
                  name: 'FailedRecordDetailsError',
                  message: 'Job finished being processed but failed to process',
                  data: { jobId: id }
              } as SfResult)
            : { status: 0, result: { jobInfo: { id } } };
    };
    return { data, calls, queries, run, sf };
}

async function exec(
    org: ReturnType<typeof fakeOrg>,
    steps: CleanStep[],
    over: { hardDelete?: boolean; stopAfter?: number } = {}
) {
    const events: CleanEvent[] = [];
    const workDir = await mkdtemp(path.join(tmpdir(), 'clean-'));
    let polls = 0;
    const result = await executePlan({
        plan: plan(steps),
        alias: 'CDEV5',
        hardDelete: over.hardDelete ?? true,
        run: org.run,
        sf: org.sf,
        workDir,
        emit: (e) => events.push(e),
        isStopped: () => over.stopAfter !== undefined && polls++ >= over.stopAfter
    });
    return { result, events };
}

describe('executePlan', () => {
    it('löscht in Planreihenfolge: Kinder zuerst, dann der Account', async () => {
        const org = fakeOrg({
            Case: ['500a', '500b'],
            Contact: ['003a'],
            Account: ['001a', '001b']
        });
        const { result, events } = await exec(org, [
            step(1, 'Case'),
            step(2, 'Contact'),
            step(3, 'Account')
        ]);
        expect(result).toMatchObject({ deleted: 5, failed: 0, stopped: false });
        expect(org.data).toEqual({ Case: [], Contact: [], Account: [] });
        expect(events.at(-1)).toMatchObject({ type: 'end', ok: true, deleted: 5 });
        expect(
            org.calls
                .filter((c) => c[2] === 'bulk' || c[1] === 'delete')
                .map((c) => c[c.indexOf('-s') + 1])
                .filter(Boolean)
        ).toEqual(['Case', 'Contact', 'Account']);
    });

    it('nutzt Hard Delete und wartet auf den Auftrag', async () => {
        const org = fakeOrg({ Contact: ['003a'] });
        await exec(org, [step(1, 'Contact')]);
        const del = org.calls.find((c) => c[1] === 'delete')!;
        expect(del).toContain('--hard-delete');
        expect(del).toContain('--wait');
        const soft = fakeOrg({ Contact: ['003a'] });
        await exec(soft, [step(1, 'Contact')], { hardDelete: false });
        expect(soft.calls.find((c) => c[1] === 'delete')).not.toContain('--hard-delete');
    });

    it('löst falsche Reihenfolgen im zweiten Durchlauf auf (Account vor Case)', async () => {
        const org = fakeOrg({ Case: ['500a'], Account: ['001a'] });
        const { result, events } = await exec(org, [step(1, 'Account'), step(2, 'Case')]);
        expect(org.data).toEqual({ Case: [], Account: [] });
        expect(result).toMatchObject({ deleted: 2, failed: 0 });
        const accountStates = events
            .filter((e) => e.type === 'step' && e.object === 'Account')
            .map((e) => (e as { state: string }).state);
        expect(accountStates).toEqual(['running', 'failed', 'running', 'done']);
    });

    it('meldet Fehler, wenn sich etwas nicht löschen lässt, und bricht die Durchläufe ab', async () => {
        const org = fakeOrg({ Case: ['500a'], Account: ['001a'] });
        const { result, events } = await exec(org, [step(1, 'Account')]); // Case steht nicht im Plan: Account bleibt blockiert
        expect(result).toMatchObject({ deleted: 0, failed: 1 });
        expect(events.at(-1)).toMatchObject({ type: 'end', ok: false });
        expect(events.some((e) => e.type === 'log' && e.text.includes('ENTITY_IS_DELETED'))).toBe(
            true
        );
        expect(org.calls.filter((c) => c[1] === 'delete').length).toBe(1); // ohne Fortschritt kein weiterer Durchlauf
    });

    it('überspringt leere Schritte und setzt aktivierte Orders vor dem Löschen auf Draft', async () => {
        const org = fakeOrg({ Order: ['801a'] });
        const { events } = await exec(org, [
            step(1, 'Contact', { count: 0 }),
            step(2, 'Order', { prepare: 'deactivate-orders' })
        ]);
        expect(events.find((e) => e.type === 'step' && e.object === 'Contact')).toMatchObject({
            state: 'skipped'
        });
        const order = org.calls.map((c) => c[1]);
        expect(order.indexOf('update')).toBeGreaterThan(-1);
        expect(order.indexOf('update')).toBeLessThan(order.indexOf('delete'));
    });

    it('hält auf Wunsch an', async () => {
        const org = fakeOrg({ Case: ['500a'], Contact: ['003a'], Account: ['001a'] });
        const { result } = await exec(
            org,
            [step(1, 'Case'), step(2, 'Contact'), step(3, 'Account')],
            { stopAfter: 1 }
        );
        expect(result.stopped).toBe(true);
        expect(org.data.Account).toEqual(['001a']); // nichts nach dem Stopp
    });
});

describe('readOutcome', () => {
    it('erkennt einen fatalen Fehler und liefert die Berechtigungsmeldung', async () => {
        const out = await readOutcome(
            { status: 1, message: '\nBulk API hard delete not allowed' } as SfResult,
            {
                sf: (async () => ({ status: 0 })) as SfRunner,
                alias: 'a',
                workDir: '.',
                sent: 4
            }
        );
        expect(out).toMatchObject({
            processed: 0,
            failed: 4,
            fatal: 'Bulk API hard delete not allowed'
        });
    });
});
