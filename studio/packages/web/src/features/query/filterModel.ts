import {
    isOrGroup,
    type DescribedField,
    type Filter,
    type FilterNode,
    type FilterOperator,
    type FilterValue
} from '@studio/shared';

// Welche Art Eingabe passt zu einem Feld (aus dem Describe der Quelle).
export type InputKind = 'text' | 'number' | 'boolean' | 'date';

export function inputKind(field: DescribedField | undefined): InputKind {
    switch (field?.baseType) {
        case 'boolean':
            return 'boolean';
        case 'date':
        case 'datetime':
            return 'date';
        case 'int':
        case 'double':
        case 'currency':
        case 'percent':
            return 'number';
        default:
            return 'text';
    }
}

// Auswahl im Dialog; "ist leer" ist = null, "ist nicht leer" ist != null.
export interface OperatorChoice {
    id: string;
    label: string;
    op: FilterOperator;
    empty?: boolean;
}

const EMPTY: OperatorChoice[] = [
    { id: 'empty', label: 'ist leer', op: '=', empty: true },
    { id: 'notempty', label: 'ist nicht leer', op: '!=', empty: true }
];

export function operatorChoices(kind: InputKind): OperatorChoice[] {
    const c = (op: FilterOperator, label: string): OperatorChoice => ({ id: op, label, op });
    if (kind === 'boolean') return [c('=', 'ist'), c('!=', 'ist nicht')];
    if (kind === 'number' || kind === 'date') {
        return [
            c('=', '='),
            c('!=', '≠'),
            c('<', '<'),
            c('<=', '≤'),
            c('>', '>'),
            c('>=', '≥'),
            ...EMPTY
        ];
    }
    return [
        c('=', 'ist gleich'),
        c('!=', 'ist ungleich'),
        c('LIKE', 'enthält / Muster'),
        c('IN', 'ist eines von'),
        c('NOT IN', 'ist keines von'),
        ...EMPTY
    ];
}

export const choiceOf = (f: Filter, kind: InputKind): OperatorChoice =>
    operatorChoices(kind).find((o) =>
        f.value.kind === 'null' ? o.empty && o.op === f.op : !o.empty && o.op === f.op
    ) ?? operatorChoices(kind)[0]!;

export function defaultValue(kind: InputKind): FilterValue {
    if (kind === 'boolean') return { kind: 'boolean', value: true };
    if (kind === 'number') return { kind: 'number', value: '0' };
    if (kind === 'date') return { kind: 'literal', value: 'LAST_N_DAYS:7' };
    return { kind: 'string', value: '' };
}

export const RELATIVE_DATES = [
    { id: 'LAST_N_DAYS', label: 'letzte N Tage', needsN: true },
    { id: 'NEXT_N_DAYS', label: 'nächste N Tage', needsN: true },
    { id: 'TODAY', label: 'heute', needsN: false },
    { id: 'YESTERDAY', label: 'gestern', needsN: false },
    { id: 'THIS_MONTH', label: 'dieser Monat', needsN: false },
    { id: 'LAST_MONTH', label: 'letzter Monat', needsN: false },
    { id: 'THIS_YEAR', label: 'dieses Jahr', needsN: false },
    { id: 'LAST_YEAR', label: 'letztes Jahr', needsN: false }
] as const;

// Werte-Liste als Text: "DE, AT" ↔ [{string DE}, {string AT}] (Komma trennt, Leerzeichen am Rand fallen weg).
export const listToText = (v: FilterValue): string =>
    v.kind === 'list' ? v.values.map((x) => ('value' in x ? String(x.value) : '')).join(', ') : '';
export const textToList = (text: string): FilterValue => ({
    kind: 'list',
    values: text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((value) => ({ kind: 'string' as const, value }))
});

// Ist die Zeile vollständig genug, um gespeichert zu werden?
export function rowProblem(f: Filter): string | null {
    const v = f.value;
    if (!f.field) return 'Feld wählen';
    if (v.kind === 'string' && !v.value && f.op !== '=' && f.op !== '!=')
        return `${f.field}: Wert fehlt`;
    if (v.kind === 'list' && !v.values.length) return `${f.field}: mindestens ein Wert`;
    if (v.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(v.value)) return `${f.field}: Zahl erwartet`;
    if (v.kind === 'date' && !v.value) return `${f.field}: Datum fehlt`;
    if (v.kind === 'literal' && /_N_/.test(v.value) && !/:\d+$/.test(v.value))
        return `${f.field}: Anzahl Tage fehlt`;
    return null;
}

// Alle Einzelbedingungen eines Filterbaums (auch die in ODER-Gruppen).
export const allFilters = (nodes: FilterNode[]): Filter[] =>
    nodes.flatMap((n) => (isOrGroup(n) ? n.or : [n]));

// Vor dem Speichern: Gruppen mit einer Bedingung werden zur einfachen Bedingung, leere fallen weg.
export function normaliseNodes(nodes: FilterNode[]): FilterNode[] {
    return nodes.flatMap((n): FilterNode[] => {
        if (!isOrGroup(n)) return [n];
        if (n.or.length >= 2) return [n];
        return n.or;
    });
}
