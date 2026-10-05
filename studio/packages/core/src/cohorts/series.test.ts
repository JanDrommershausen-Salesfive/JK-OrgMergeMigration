import { describe, expect, it } from 'vitest';
import {
    blockCount,
    countSeriesRecords,
    resolveSeriesIds,
    seriesCohorts,
    splitIntoBlocks
} from './series';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `001${String(i).padStart(12, '0')}`);

describe('splitIntoBlocks', () => {
    it('schneidet in Blöcke, der letzte ist kürzer', () => {
        expect(splitIntoBlocks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(blockCount(18831, 500)).toBe(38);
    });
});

describe('seriesCohorts', () => {
    it('legt aus den Ids Blöcke an: jede Id genau einmal, in der gegebenen Reihenfolge', () => {
        const all = ids(1100);
        const cohorts = seriesCohorts({
            name: 'Alle Accounts',
            rootObject: 'Account',
            ids: all,
            blockSize: 500,
            filters: [],
            seriesId: 's1',
            now: new Date('2026-10-05T10:00:00Z')
        });
        expect(cohorts.map((c) => c.count)).toEqual([500, 500, 100]);
        expect(cohorts.map((c) => c.name)).toEqual([
            'Alle Accounts 1/3',
            'Alle Accounts 2/3',
            'Alle Accounts 3/3'
        ]);
        expect(cohorts.flatMap((c) => c.ids)).toEqual(all);
        expect(new Set(cohorts.map((c) => c.id)).size).toBe(3);
        expect(cohorts[1]!.series).toMatchObject({ id: 's1', index: 2, total: 3 });
        expect(cohorts[0]!.rule).toEqual({ kind: 'ids', ids: all.slice(0, 500) });
    });

    it('füllt die Blocknummer auf, damit die Namen sortierbar bleiben', () => {
        const cohorts = seriesCohorts({
            name: 'A',
            rootObject: 'Account',
            ids: ids(12),
            blockSize: 1,
            filters: [],
            seriesId: 's'
        });
        expect(cohorts[0]!.name).toBe('A 01/12');
        expect(cohorts[11]!.name).toBe('A 12/12');
    });
});

describe('resolveSeriesIds', () => {
    it('sortiert nach Erstelldatum und Id und wendet den Filter an', async () => {
        const seen: string[] = [];
        const run = async (_a: string, soql: string) => {
            seen.push(soql);
            return { records: [{ Id: '001A' }, { Id: '001B' }], totalSize: 2 };
        };
        const filters = [
            {
                field: 'Type',
                op: '=' as const,
                value: { kind: 'string' as const, value: 'Customer' }
            }
        ];
        expect(
            await resolveSeriesIds({ rootObject: 'Account', filters, sourceAlias: 'us', run })
        ).toEqual(['001A', '001B']);
        expect(seen[0]).toBe(
            "SELECT Id FROM Account WHERE Type = 'Customer' ORDER BY CreatedDate, Id LIMIT 50001"
        );
    });

    it('prüft eine eigene Liste in Abschnitten auf Existenz und behält die Reihenfolge', async () => {
        const all = ids(1200);
        let calls = 0;
        const run = async (_a: string, soql: string) => {
            calls++;
            return {
                records: all.filter((id) => soql.includes(`'${id}'`)).map((Id) => ({ Id })),
                totalSize: 0
            };
        };
        const reversed = [...all].reverse();
        expect(
            await resolveSeriesIds({
                rootObject: 'Account',
                filters: [],
                ids: reversed,
                sourceAlias: 'us',
                run
            })
        ).toEqual(reversed);
        expect(calls).toBe(3);
        await expect(
            resolveSeriesIds({
                rootObject: 'Account',
                filters: [],
                ids: [...all.slice(0, 3), '001ZZZZZZZZZZZZZZZ'],
                sourceAlias: 'us',
                run
            })
        ).rejects.toThrow(/1 Ids gibt es in der Quelle nicht/);
    });

    it('lehnt leere und zu große Ergebnisse ab', async () => {
        await expect(
            resolveSeriesIds({
                rootObject: 'Account',
                filters: [],
                sourceAlias: 'us',
                run: async () => ({ records: [], totalSize: 0 })
            })
        ).rejects.toThrow(/keine passenden/);
        await expect(
            resolveSeriesIds({
                rootObject: 'Account',
                filters: [],
                sourceAlias: 'us',
                run: async () => ({ records: ids(50001).map((Id) => ({ Id })), totalSize: 50001 })
            })
        ).rejects.toThrow(/Mehr als 50000/);
    });
});

describe('countSeriesRecords', () => {
    it('zählt mit demselben Filter', async () => {
        let soql = '';
        const n = await countSeriesRecords({
            rootObject: 'Account',
            filters: [],
            sourceAlias: 'us',
            run: async (_a, q) => ((soql = q), { records: [], totalSize: 18831 })
        });
        expect(n).toBe(18831);
        expect(soql).toBe('SELECT COUNT() FROM Account');
    });
});
