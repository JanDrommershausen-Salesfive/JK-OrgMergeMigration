import {
    isOrGroup,
    type Filter,
    type FilterNode,
    type FilterOperator,
    type FilterValue
} from '@studio/shared';

// Ein bewusst kleiner SOQL-Teil: SELECT Felder FROM Objekt [WHERE a AND b …] [ORDER BY/LIMIT/OFFSET].
// Alles, was darüber hinausgeht (Unterabfragen, Funktionen, OR, Klammern), bleibt unangetastet im Rohmodus.

export interface ParsedQuery {
    fields: string[];
    object: string;
    filters: FilterNode[] | null; // null: WHERE nicht darstellbar, siehe rawWhere
    rawWhere: string | null;
    tail: string;
    supported: boolean; // false: SELECT-Teil nicht darstellbar
}

const TAIL = /\s+(ORDER\s+BY|LIMIT|OFFSET|GROUP\s+BY|HAVING|FOR\s+(?:VIEW|REFERENCE|UPDATE))\b/i;

// Teilt text an einem Trennwort außerhalb von Anführungszeichen und Klammern.
function splitTopLevel(text: string, separator: RegExp): string[] | null {
    const parts: string[] = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '\\') i++;
            else if (c === "'") quoted = false;
        } else if (c === "'") quoted = true;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0) {
            const m = text.slice(i).match(separator);
            if (m && m.index === 0) {
                parts.push(text.slice(start, i));
                i += m[0].length - 1;
                start = i + 1;
            }
        }
    }
    if (quoted || depth !== 0) return null;
    parts.push(text.slice(start));
    return parts.map((p) => p.trim());
}

function parseScalar(raw: string): FilterValue | null {
    const text = raw.trim();
    if (/^'(?:[^'\\]|\\.)*'$/.test(text)) {
        return { kind: 'string', value: text.slice(1, -1).replace(/\\(.)/g, '$1') };
    }
    if (/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'number', value: text };
    if (/^true$/i.test(text)) return { kind: 'boolean', value: true };
    if (/^false$/i.test(text)) return { kind: 'boolean', value: false };
    if (/^null$/i.test(text)) return { kind: 'null' };
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/.test(text))
        return { kind: 'date', value: text };
    if (/^[A-Z_]+(:\d+)?$/.test(text)) return { kind: 'literal', value: text };
    return null;
}

function parseValue(raw: string, op: FilterOperator): FilterValue | null {
    const text = raw.trim();
    if (op === 'IN' || op === 'NOT IN') {
        if (!/^\(.*\)$/s.test(text)) return null;
        const items = splitTopLevel(text.slice(1, -1), /^,/);
        if (!items) return null;
        const values = items.map(parseScalar);
        return values.every((v): v is FilterValue => v !== null) ? { kind: 'list', values } : null;
    }
    return parseScalar(text);
}

const CLAUSE = /^([A-Za-z_][\w.]*)\s*(NOT\s+IN|IN|LIKE|!=|<=|>=|=|<|>)\s*([\s\S]+)$/i;

function parseClause(clause: string): Filter | null {
    const m = clause.match(CLAUSE);
    if (!m) return null;
    const op = (m[2] as string).toUpperCase().replace(/\s+/g, ' ') as FilterOperator;
    const value = parseValue(m[3] as string, op);
    return value ? { field: m[1] as string, op, value } : null;
}

export function parseSoql(query: string): ParsedQuery {
    const head = query.trim().match(/^SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)([\s\S]*)$/i);
    if (!head)
        return {
            fields: [],
            object: '',
            filters: null,
            rawWhere: null,
            tail: '',
            supported: false
        };
    const selectList = head[1] as string;
    const object = head[2] as string;
    const rest = (head[3] as string).trim();

    const fields = selectList.split(',').map((f) => f.trim());
    const plainFields = fields.every((f) => /^[A-Za-z_][\w.]*$/.test(f));

    const tailAt = rest.search(TAIL);
    const body = tailAt === -1 ? rest : rest.slice(0, tailAt).trim();
    const tail = tailAt === -1 ? '' : rest.slice(tailAt).trim();
    const whereMatch = body.match(/^WHERE\s+([\s\S]+)$/i);
    if (body && !whereMatch) {
        return { fields, object, filters: null, rawWhere: body, tail, supported: plainFields };
    }
    if (!whereMatch)
        return { fields, object, filters: [], rawWhere: null, tail, supported: plainFields };

    const whereText = whereMatch[1] as string;
    const clauses = splitTopLevel(whereText, /^\s+AND\s+/i);
    const nodes = clauses?.map(parseNodes) ?? [];
    const ok = clauses !== null && nodes.every((n): n is FilterNode[] => n !== null);
    return {
        fields,
        object,
        filters: ok ? (nodes as FilterNode[][]).flat() : null,
        rawWhere: ok ? null : whereText,
        tail,
        supported: plainFields
    };
}

// Steht der ganze Text in einem Klammerpaar, zum Beispiel "(A = 1 OR B = 2)"?
function unwrap(text: string): string | null {
    if (!text.startsWith('(') || !text.endsWith(')')) return null;
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '\\') i++;
            else if (c === "'") quoted = false;
        } else if (c === "'") quoted = true;
        else if (c === '(') depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0 && i < text.length - 1) return null; // Klammer schließt vor dem Ende
        }
    }
    return text.slice(1, -1).trim();
}

// Eine UND-Teilbedingung: einfache Bedingung, ODER-Gruppe in Klammern oder verschachtelte UND-Liste.
// Alles Weitere (ODER mit UND darin, tiefere Klammern) bleibt im Rohmodus (null).
function parseNodes(clause: string): FilterNode[] | null {
    const inner = unwrap(clause.trim());
    if (inner === null) {
        const f = parseClause(clause);
        return f ? [f] : null;
    }
    const ors = splitTopLevel(inner, /^\s+OR\s+/i);
    if (ors && ors.length > 1) {
        const filters = ors.map(parseClause);
        return filters.every((f): f is Filter => f !== null) ? [{ or: filters }] : null;
    }
    const ands = splitTopLevel(inner, /^\s+AND\s+/i);
    if (!ands) return null;
    const parts = ands.map(parseNodes);
    return parts.every((p): p is FilterNode[] => p !== null)
        ? (parts as FilterNode[][]).flat()
        : null;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function formatValue(v: FilterValue): string {
    switch (v.kind) {
        case 'string':
            return quote(v.value);
        case 'number':
        case 'date':
        case 'literal':
            return v.value;
        case 'boolean':
            return v.value ? 'true' : 'false';
        case 'null':
            return 'null';
        case 'list':
            return `(${v.values.map(formatValue).join(', ')})`;
    }
}

export const formatFilter = (f: Filter) => `${f.field} ${f.op} ${formatValue(f.value)}`;

export const formatNode = (n: FilterNode): string =>
    isOrGroup(n) ? `(${n.or.map(formatFilter).join(' OR ')})` : formatFilter(n);

export interface SoqlParts {
    fields: string[];
    object: string;
    filters: FilterNode[] | null;
    rawWhere: string | null;
    tail: string;
}

export function buildSoql({ fields, object, filters, rawWhere, tail }: SoqlParts): string {
    const where = filters ? filters.map(formatNode).join(' AND ') : (rawWhere ?? '');
    return [`SELECT ${fields.join(', ')} FROM ${object}`, where && `WHERE ${where}`, tail]
        .filter(Boolean)
        .join(' ');
}

// WHERE im Rohmodus: nur eine Zeile, kein Semikolon, damit nichts außer einer Abfrage entstehen kann.
export function validateRawWhere(text: string): string | null {
    if (/[;\n\r]/.test(text)) return 'Keine Semikolons oder Zeilenumbrüche im WHERE-Text.';
    if (/\b(SELECT\s+.*\bFROM\b)/i.test(text) && !/\(\s*SELECT/i.test(text))
        return 'Unerwartete Abfrage im WHERE-Text.';
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '\\') i++;
            else if (c === "'") quoted = false;
        } else if (c === "'") quoted = true;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        if (depth < 0) return 'Klammern stimmen nicht.';
    }
    return quoted || depth !== 0 ? 'Anführungszeichen oder Klammern sind nicht geschlossen.' : null;
}

// Nur der WHERE-Text einer Query (ohne das Wort WHERE), leer wenn es keinen Filter gibt.
export function whereText({ filters, rawWhere }: Pick<SoqlParts, 'filters' | 'rawWhere'>): string {
    return filters ? filters.map(formatNode).join(' AND ') : (rawWhere ?? '');
}
