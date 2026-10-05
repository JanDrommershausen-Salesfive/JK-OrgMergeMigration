import type { DescribeResponse, DescribedField, FieldInfo } from '@studio/shared';

export type StatusKey =
    | 'excluded'
    | 'pending'
    | 'unknown'
    | 'srcmissing'
    | 'missing'
    | 'readonly'
    | 'type'
    | 'mapped'
    | 'ok';

export type StatusTone = 'plain' | 'warn' | 'bad' | 'ren' | 'ok';

export interface FieldStatus {
    key: StatusKey;
    label: string;
    tone: StatusTone;
    src?: DescribedField;
    tgt?: DescribedField;
}

const polymorphic = (f: DescribedField) => /^reference\(\d+ Objekte\)$/.test(f.type);

// Vergleicht ein Query-Feld mit den Describe-Daten aus Quelle und Ziel.
export function fieldStatus(f: FieldInfo, d: DescribeResponse | undefined): FieldStatus {
    if (f.excluded)
        return { key: 'excluded', label: 'von Migration ausgeschlossen', tone: 'plain' };
    if (!d) return { key: 'pending', label: 'prüfe …', tone: 'plain' };
    if (!d.target.ok) return { key: 'unknown', label: 'Ziel nicht lesbar', tone: 'warn' };

    const src = d.source.ok ? d.source.fields[f.name] : undefined;
    const tgt = d.target.fields[f.targetField];
    if (d.source.ok && !src) {
        return {
            key: 'srcmissing',
            label: 'fehlt in Quelle, wird ausgelassen',
            tone: 'warn',
            src,
            tgt
        };
    }
    if (!tgt) return { key: 'missing', label: '✕ fehlt im Ziel', tone: 'bad', src, tgt };
    if (!tgt.createable && f.targetField !== 'Id' && tgt.baseType !== 'address') {
        return { key: 'readonly', label: 'im Ziel nicht schreibbar', tone: 'warn', src, tgt };
    }
    const same = src && (polymorphic(src) && polymorphic(tgt) ? true : src.type === tgt.type);
    if (src && !same) return { key: 'type', label: 'Typ/Länge weicht ab', tone: 'warn', src, tgt };
    if (f.renamed) return { key: 'mapped', label: '⇄ gemappt', tone: 'ren', src, tgt };
    return { key: 'ok', label: '✓ 1:1', tone: 'ok', src, tgt };
}

export function countStatuses(rows: { s: FieldStatus }[]): Record<StatusKey, number> {
    const counts = {
        excluded: 0,
        pending: 0,
        unknown: 0,
        srcmissing: 0,
        missing: 0,
        readonly: 0,
        type: 0,
        mapped: 0,
        ok: 0
    } satisfies Record<StatusKey, number>;
    for (const { s } of rows) counts[s.key]++;
    return counts;
}
