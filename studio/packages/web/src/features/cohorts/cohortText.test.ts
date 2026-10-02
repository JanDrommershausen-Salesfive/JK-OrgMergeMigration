import { describe, expect, it } from 'vitest';
import { estimateMb, parseIds } from './cohortText';

describe('cohortText', () => {
    it('trennt Ids an Leerzeichen, Kommas, Semikolons und Zeilenumbrüchen und entfernt Doppelte', () => {
        expect(parseIds('001A, 001B;001A\n001C  \n')).toEqual(['001A', '001B', '001C']);
        expect(parseIds('  ')).toEqual([]);
    });

    it('schätzt den Speicherbedarf', () => {
        expect(estimateMb(10)).toBe('<0,1 MB');
        expect(estimateMb(1024)).toBe('2 MB');
    });
});
