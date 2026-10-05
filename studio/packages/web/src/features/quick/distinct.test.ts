import { describe, expect, it } from 'vitest';
import { distinctValues, newMappingRows } from './distinct';

describe('distinctValues', () => {
    it('zählt Zeilen je Wert, häufigste zuerst, leere als eigener Wert', () => {
        const rows = [['CA'], ['NY'], ['CA'], [''], ['CA'], ['NY']];
        expect(distinctValues(['BillingState'], rows, 0)).toEqual([
            { value: 'CA', count: 3 },
            { value: 'NY', count: 2 },
            { value: '', count: 1 }
        ]);
    });

    it('nimmt bei GROUP BY die mitgelieferte Anzahl', () => {
        const rows = [
            ['CA', '40'],
            ['NY', '7'],
            ['', '3']
        ];
        expect(distinctValues(['BillingState', 'expr0'], rows, 0)).toEqual([
            { value: 'CA', count: 40 },
            { value: 'NY', count: 7 },
            { value: '', count: 3 }
        ]);
    });

    it('zählt Zeilen, wenn die zweite Spalte keine Zahlen enthält', () => {
        expect(
            distinctValues(
                ['A', 'B'],
                [
                    ['x', 'a'],
                    ['x', 'b']
                ],
                0
            )
        ).toEqual([{ value: 'x', count: 2 }]);
    });
});

describe('newMappingRows', () => {
    it('übernimmt nur neue, nicht leere Werte mit gleichem Zielwert', () => {
        const values = [
            { value: 'CA', count: 3 },
            { value: 'Calif.', count: 2 },
            { value: '', count: 1 }
        ];
        expect(newMappingRows(values, [{ from: 'CA', to: 'California' }])).toEqual([
            { from: 'Calif.', to: 'Calif.' }
        ]);
    });
});
