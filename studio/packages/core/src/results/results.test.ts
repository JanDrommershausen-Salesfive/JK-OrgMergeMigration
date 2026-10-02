import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RunEvent } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { LastRunStore } from '../runs/lastRuns';
import { RunManager } from '../runs/runManager';
import { archiveRun } from './archive';
import { readMissingParents, readTargetTable } from './csvTables';
import { parseLog, sumSummary } from './parseLog';
import { ResultStore } from './store';

// Ausschnitt aus einem echten SFDMU-Simulationslauf (Contact).
const LOG = `
Warning: [18:24:40.183] [WARNING] [WARNING] {Contact.AssistantName} Missing in the Source and will be excluded from the migration.
Warning: [18:24:40.184] [WARNING] [WARNING] {Contact.Birthdate} Missing in the Source and will be excluded from the migration.
 ›   Warning: @salesforce/cli update available from 2.118.20 to 2.151.7.
Warning: [18:24:41.833] [WARNING] {Contact} 36 missing parent lookup records were found. See MissingParentRecordsReport.csv file for the details.
Warning: [18:24:41.834] [WARNING] [18:24:41.834] Continue the job (y/n) ? y
[18:24:41.883] ===== DATA PROCESSING SUMMARY =====
[18:24:41.883] {Account} Totally processed 0 records:
[18:24:41.884] PASS 1: None.
[18:24:41.884] PASS 2: None.
[18:24:41.884] {Contact} Totally processed 48 records:
[18:24:41.884] PASS 1: Updated 17, Deleted 0, Inserted 29.
[18:24:41.885] PASS 2: Updated 1, Deleted 0, Inserted 0.


[18:24:41.898] ===== MIGRATION JOB ENDED =====
`;

const INSERT_CSV =
    '﻿"Id","Old Id","FirstName","LastName","Email","Errors"\n' +
    '"FKB1","003A","Bayla","Rausch","#N/A","#N/A"\n' +
    '"FKB2","003B","Max","Muster","max@x.de","FIELD_CUSTOM_VALIDATION_EXCEPTION: Land fehlt"\n';

const REPORT_CSV =
    '﻿"Date update","Lookup field name","Lookup reference field name","Missing parent External Id value","Parent ExternalId field name","Parent SObject name","Record Id","sObject name"\n' +
    '"d","AccountId","Account.Name","Planet Fitness","Name","Account","003A","Contact"\n' +
    '"d","AccountId","Account.Name","Planet Fitness","Name","Account","003A","Contact"\n' +
    '"d","AccountId","Account.Name","Planet Fitness","Name","Account","003B","Contact"\n' +
    '"d","AccountId","Account.Name","Gym 2","Name","Account","003C","Contact"\n';

describe('parseLog', () => {
    const parsed = parseLog(LOG);

    it('liest die Zusammenfassung je Objekt', () => {
        expect(parsed.summary).toEqual([
            {
                object: 'Account',
                processed: 0,
                passes: [
                    { pass: 1, updated: 0, deleted: 0, inserted: 0 },
                    { pass: 2, updated: 0, deleted: 0, inserted: 0 }
                ]
            },
            {
                object: 'Contact',
                processed: 48,
                passes: [
                    { pass: 1, updated: 17, deleted: 0, inserted: 29 },
                    { pass: 2, updated: 1, deleted: 0, inserted: 0 }
                ]
            }
        ]);
        expect(sumSummary(parsed.summary)).toEqual({ inserted: 29, updated: 18, deleted: 0 });
    });

    it('sammelt Warnungen ohne Rückfrage und CLI-Hinweise', () => {
        expect(parsed.warnings.map((w) => w.kind)).toEqual([
            'missing-field',
            'missing-field',
            'missing-parents'
        ]);
        expect(parsed.warnings[0]?.message).toBe(
            '{Contact.AssistantName} Missing in the Source and will be excluded from the migration.'
        );
    });

    it('erkennt Fehlerzeilen', () => {
        const r = parseLog(
            '[10:00:00.000] [ERROR] Something broke\nABORT: alias zeigt woanders hin'
        );
        expect(r.errors).toEqual(['Something broke', 'ABORT: alias zeigt woanders hin']);
    });
});

describe('CSV-Tabellen', () => {
    it('findet Zeilen mit Fehlertext und ignoriert #N/A', () => {
        const t = readTargetTable('Contact_insert_target.csv', INSERT_CSV);
        expect(t.rows).toBe(2);
        expect(t.errors).toEqual([
            {
                file: 'insert',
                id: 'FKB2',
                oldId: '003B',
                label: 'max@x.de',
                error: 'FIELD_CUSTOM_VALIDATION_EXCEPTION: Land fehlt'
            }
        ]);
    });

    it('dedupliziert fehlende Parents und gruppiert nach Wert', () => {
        const { rows, groups } = readMissingParents(REPORT_CSV);
        expect(rows).toHaveLength(3);
        expect(groups).toEqual([
            {
                lookupField: 'AccountId',
                parentObject: 'Account',
                value: 'Planet Fitness',
                records: 2
            },
            { lookupField: 'AccountId', parentObject: 'Account', value: 'Gym 2', records: 1 }
        ]);
    });
});

async function fixture() {
    const dir = await mkdtemp(path.join(tmpdir(), 'res-'));
    const folder = path.join(dir, 'sfdmu', '020_Contact');
    await mkdir(path.join(folder, 'target'), { recursive: true });
    await mkdir(path.join(folder, 'reports'), { recursive: true });
    await writeFile(path.join(folder, 'target', 'Contact_insert_target.csv'), INSERT_CSV);
    await writeFile(path.join(folder, 'reports', 'MissingParentRecordsReport.csv'), REPORT_CSV);
    return { dir, sfdmuDir: path.join(dir, 'sfdmu') };
}

describe('Archiv', () => {
    it('archiviert einen Lauf und liest ihn wieder', async () => {
        const { dir, sfdmuDir } = await fixture();
        const meta = await archiveRun({
            projectDir: dir,
            sfdmuDir,
            folder: '020_Contact',
            object: 'Contact',
            mode: 'simulation',
            sourceAlias: 'a',
            targetAlias: 'b',
            startedAt: new Date('2026-10-02T16:24:38Z'),
            endedAt: new Date('2026-10-02T16:24:42Z'),
            exitCode: 0,
            signal: null,
            stopped: false,
            log: LOG
        });
        expect(meta).toMatchObject({
            id: '2026-10-02T16-24-38Z',
            ok: true,
            durationMs: 4000,
            counts: { inserted: 29, updated: 18, errors: 1, missingParents: 3, warnings: 3 }
        });

        const store = new ResultStore(dir);
        expect((await store.list('020_Contact')).map((m) => m.id)).toEqual([meta.id]);
        const detail = await store.detail('020_Contact', meta.id);
        expect(detail.errorsTotal).toBe(1);
        expect(detail.missingParentGroups[0]?.records).toBe(2);
        expect(await store.log('020_Contact', meta.id)).toContain('DATA PROCESSING SUMMARY');
    });

    it('listet Läufe aller Objekte, neueste zuerst', async () => {
        const { dir, sfdmuDir } = await fixture();
        const base = {
            projectDir: dir,
            sfdmuDir,
            object: 'Contact',
            mode: 'simulation' as const,
            sourceAlias: 'a',
            targetAlias: 'b',
            exitCode: 0,
            signal: null,
            stopped: false,
            log: ''
        };
        await archiveRun({
            ...base,
            folder: '020_Contact',
            startedAt: new Date('2026-10-02T10:00:00Z'),
            endedAt: new Date('2026-10-02T10:00:05Z')
        });
        await archiveRun({
            ...base,
            folder: '010_Account',
            startedAt: new Date('2026-10-02T11:00:00Z'),
            endedAt: new Date('2026-10-02T11:00:05Z')
        });
        const all = await new ResultStore(dir).listAll();
        expect(all.map((m) => m.folder)).toEqual(['010_Account', '020_Contact']);
    });

    it('lehnt Pfadtricks bei Ordner und ID ab', async () => {
        const store = new ResultStore('/tmp');
        await expect(store.meta('..', 'x')).rejects.toThrow(/Unbekannt/);
        await expect(store.log('020_Contact', '../../etc')).rejects.toThrow(/Unbekannt/);
    });

    it('RunManager archiviert nach dem Lauf, bevor das Ende gemeldet wird', async () => {
        const { dir, sfdmuDir } = await fixture();
        await writeFile(path.join(sfdmuDir, 'run.sh'), 'echo "hallo"\n');
        const store = new LastRunStore(dir);
        const manager = new RunManager(sfdmuDir, store, (end) =>
            archiveRun({
                ...end,
                projectDir: dir,
                sfdmuDir,
                object: 'Contact',
                sourceAlias: 'a',
                targetAlias: 'b'
            })
        );
        const events: RunEvent[] = [];
        const done = new Promise<void>((resolve) =>
            manager.subscribe((e) => {
                events.push(e);
                if (e.type === 'end') resolve();
            })
        );
        manager.start('020_Contact', 'simulation', 'b');
        await done;

        const last = (await store.all())['020_Contact'];
        expect(last).toMatchObject({ ok: true, errors: 1, missingParents: 3 });
        const log = await readFile(
            path.join(dir, 'runs', '020_Contact', last?.runId ?? 'x', 'log.txt'),
            'utf8'
        );
        expect(log).toContain('beendet (Exit-Code 0)');
    });
});
