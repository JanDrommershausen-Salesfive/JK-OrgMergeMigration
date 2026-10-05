import type { ConfigChange } from '@studio/shared';
import { parseSoql } from '../query/soql';
import { whereText } from '../query/soql';
import { parseCsv } from '../sfdmu/csv';
import { objectOf, type ExportConfig, type ExportObject } from '../sfdmu/exportConfig';
import type { ConfigFiles } from './compare';

// Parent-Modus in den Worten der Oberfläche; Einträge ohne master:false sind von Hand geschrieben.
const MODE = (o: ExportObject) =>
    o.master === false
        ? o.operation === 'Readonly'
            ? 'Nur lesen'
            : 'Mitziehen'
        : `${o.operation} (manuell)`;

const list = (items: string[]) => items.join(', ');
const added = <T>(from: T[], to: T[]) => to.filter((x) => !from.includes(x));

function diffEntry(label: string, from: ExportObject, to: ExportObject, out: ConfigChange[]) {
    const a = parseSoql(from.query);
    const b = parseSoql(to.query);
    if (a.supported && b.supported) {
        const plus = added(a.fields, b.fields);
        const minus = added(b.fields, a.fields);
        if (plus.length)
            out.push({ area: 'query', text: `${label}: Felder hinzugefügt: ${list(plus)}` });
        if (minus.length)
            out.push({ area: 'query', text: `${label}: Felder entfernt: ${list(minus)}` });
        const wa = whereText(a) || 'kein Filter';
        const wb = whereText(b) || 'kein Filter';
        if (wa !== wb) out.push({ area: 'filter', text: `${label}: Filter ${wa} → ${wb}` });
        if (a.tail !== b.tail)
            out.push({
                area: 'query',
                text: `${label}: ${a.tail || 'kein ORDER BY/LIMIT'} → ${b.tail || 'kein ORDER BY/LIMIT'}`
            });
    } else if (from.query !== to.query) {
        out.push({ area: 'query', text: `${label}: Query geändert` });
    }
    if (MODE(from) !== MODE(to))
        out.push({ area: 'parent', text: `${label}: ${MODE(from)} → ${MODE(to)}` });
    if ((from.externalId ?? '') !== (to.externalId ?? '')) {
        out.push({
            area: 'other',
            text: `${label}: External ID ${from.externalId || '–'} → ${to.externalId || '–'}`
        });
    }

    const mapKey = (o: ExportObject) =>
        new Map((o.fieldMapping ?? []).map((m) => [m.sourceField, m.targetField]));
    const ma = mapKey(from);
    const mb = mapKey(to);
    for (const [src, tgt] of mb) {
        if (!ma.has(src))
            out.push({ area: 'mapping', text: `${label}: Mapping ${src} → ${tgt} hinzugefügt` });
        else if (ma.get(src) !== tgt)
            out.push({
                area: 'mapping',
                text: `${label}: Mapping ${src}: ${ma.get(src)} → ${tgt}`
            });
    }
    for (const [src, tgt] of ma)
        if (!mb.has(src))
            out.push({ area: 'mapping', text: `${label}: Mapping ${src} → ${tgt} entfernt` });

    const ea = from.excludedFields ?? [];
    const eb = to.excludedFields ?? [];
    if (added(ea, eb).length)
        out.push({
            area: 'excluded',
            text: `${label}: von der Migration ausgeschlossen: ${list(added(ea, eb))}`
        });
    if (added(eb, ea).length)
        out.push({
            area: 'excluded',
            text: `${label}: wieder aufgenommen: ${list(added(eb, ea))}`
        });
}

function diffValueMapping(from: string | null, to: string | null, out: ConfigChange[]) {
    const read = (csv: string | null) =>
        new Map(
            parseCsv(csv ?? '')
                .slice(1)
                .map((r) => [`${r[0]}.${r[1]}: ${r[2]}`, r[3] ?? ''])
        );
    const a = read(from);
    const b = read(to);
    for (const [key, value] of b) {
        if (!a.has(key))
            out.push({ area: 'valuemapping', text: `Wertemapping ${key} → ${value} hinzugefügt` });
        else if (a.get(key) !== value)
            out.push({
                area: 'valuemapping',
                text: `Wertemapping ${key}: ${a.get(key)} → ${value}`
            });
    }
    for (const [key, value] of a)
        if (!b.has(key))
            out.push({ area: 'valuemapping', text: `Wertemapping ${key} → ${value} entfernt` });
}

// Was ändert sich, wenn man "to" lädt, während "from" der aktuelle Stand ist? Klartext statt Dateivergleich.
export function diffConfigs(from: ConfigFiles, to: ConfigFiles): ConfigChange[] {
    const out: ConfigChange[] = [];
    const a = JSON.parse(from.exportJson) as ExportConfig;
    const b = JSON.parse(to.exportJson) as ExportConfig;
    const targetOf = (c: ExportConfig) => c.objects.length - 1;
    const label = (c: ExportConfig, i: number) =>
        i === targetOf(c)
            ? `${objectOf(c.objects[i] as ExportObject)} (Hauptobjekt)`
            : `${objectOf(c.objects[i] as ExportObject)} (Parent)`;

    // Einträge nach Objektname zuordnen, damit eine verschobene Reihenfolge nicht als Änderung zählt.
    const byObject = (c: ExportConfig) =>
        new Map(
            c.objects.map((o, i) => [`${objectOf(o)}${i === targetOf(c) ? '#target' : ''}`, i])
        );
    const ia = byObject(a);
    const ib = byObject(b);
    for (const [key, j] of ib) {
        const i = ia.get(key);
        if (i === undefined)
            out.push({
                area: 'parent',
                text: `${label(b, j)} hinzugefügt: ${MODE(b.objects[j] as ExportObject)}`
            });
        else
            diffEntry(label(b, j), a.objects[i] as ExportObject, b.objects[j] as ExportObject, out);
    }
    for (const [key, i] of ia)
        if (!ib.has(key)) out.push({ area: 'parent', text: `${label(a, i)} entfernt` });

    diffValueMapping(from.valueMapping, to.valueMapping, out);
    return out;
}
