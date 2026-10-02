import type { Cohort } from '@studio/shared';

export const ruleText = (c: Cohort): string =>
    c.rule.kind === 'sample'
        ? `Stichprobe von ${c.rule.size}${c.rule.filters.length ? ' mit Filter' : ''}`
        : 'Feste Liste';

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
