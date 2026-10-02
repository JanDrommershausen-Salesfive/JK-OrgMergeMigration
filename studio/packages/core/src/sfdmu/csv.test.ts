import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
    it('liest Anführungszeichen, Kommas und CRLF', () => {
        const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
        expect(rows).toEqual([
            ['a', 'b'],
            ['x, y', 'say "hi"']
        ]);
    });

    it('schreibt, was es liest', () => {
        const text = 'a,b\n"x, y","say ""hi"""\n';
        expect(toCsv(parseCsv(text), true)).toBe(text);
    });

    it('überspringt leere Zeilen', () => {
        expect(parseCsv('a,b\n\n\nc,d')).toEqual([
            ['a', 'b'],
            ['c', 'd']
        ]);
    });
});
