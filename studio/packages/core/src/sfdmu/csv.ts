// Minimaler CSV-Parser (Anführungszeichen, Kommas, CRLF) für ValueMapping.csv.
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    const flush = () => {
        row.push(field);
        field = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
    };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            flush();
        } else field += c;
    }
    flush();
    return rows;
}

export const csvCell = (v: string): string =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export const toCsv = (rows: string[][], trailingNewline: boolean): string =>
    rows.map((r) => r.map(csvCell).join(',')).join('\n') + (trailingNewline ? '\n' : '');
