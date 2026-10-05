import type { Cohort, Filter, FilterNode, FilterValue } from '@studio/shared';

export const ruleText = (c: Cohort): string =>
    c.series
        ? `Block ${c.series.index} von ${c.series.total}, nach Erstelldatum`
        : c.rule.kind === 'sample'
          ? c.rule.filters.length
              ? `Zufällig ${c.rule.size}, ${c.rule.filters.length} Filter`
              : `Zufällig ${c.rule.size}, ohne Filter`
          : `${c.rule.ids.length} feste Ids`;

const valueText = (v: FilterValue): string => {
    switch (v.kind) {
        case 'string':
            return `„${v.value}“`;
        case 'null':
            return 'leer';
        case 'boolean':
            return v.value ? 'wahr' : 'falsch';
        case 'list':
            return `(${v.values.map(valueText).join(', ')})`;
        default:
            return v.value;
    }
};

const filterText = (f: Filter) => `${f.field} ${f.op} ${valueText(f.value)}`;

// Eine Filterbedingung (oder ODER-Gruppe) als lesbarer Text.
export const nodeText = (n: FilterNode): string =>
    'or' in n ? n.or.map(filterText).join(' ODER ') : filterText(n);

// Ids aus einem eingefügten Text: Leerzeichen, Zeilenumbrüche, Kommas und Semikolons trennen.
export const parseIds = (text: string): string[] => [
    ...new Set(
        text
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
    )
];

// Grobe Schätzung: im Schnitt etwa 2 KB je Datensatz (Salesforce rechnet so für den Datenspeicher).
export const estimateMb = (records: number): string => {
    const mb = (records * 2) / 1024;
    return mb < 0.1 ? '<0,1 MB' : `${mb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
};
