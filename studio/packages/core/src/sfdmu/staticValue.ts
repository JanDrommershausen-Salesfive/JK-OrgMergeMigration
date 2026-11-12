import type {
    DescribedField,
    DescribeResult,
    ObjectDetail,
    StaticValueRequest
} from '@studio/shared';
import { badRequest, conflict } from '../errors';
import { buildSoql, parseSoql } from '../query/soql';
import { entryOf, updateExport, type ExportObject } from './exportConfig';

// Feste Werte für Zielfelder, die in der Quelle fehlen (zum Beispiel CurrencyIsoCode = USD).
//
// SFDMU kennt keine Konstanten, aber den Mock-Befehl c_set_value. Er arbeitet nur mit Feldern aus der
// Quell-Query. Deshalb trägt ein technisches Quellfeld den Wert: Es steht in der Query, c_set_value
// überschreibt es in jedem Datensatz, und das Feld-Mapping leitet es ins Zielfeld um.
//   query:        SELECT …, <Träger> FROM …
//   mockFields:   { name: <Träger>, pattern: "c_set_value('USD')" }
//   fieldMapping: { sourceField: <Träger>, targetField: "CurrencyIsoCode" }
// Als Träger dient ein beschreibbares Textfeld der Quelle, das es im Ziel nicht gibt und das deshalb
// nie 1:1 migriert würde (zum Beispiel ein Feld eines Managed Packages).

const PATTERN = /^c_set_value\('([^'()\\]*)'\)$/;
export const staticPattern = (value: string) => `c_set_value('${value}')`;

// SFDMU setzt den Wert ungeprüft in einen eval-Ausdruck ein. Deshalb nur harmlose Zeichen: keine Anführungs-
// zeichen, Klammern, Backslashes, Backticks, $ oder Zeilenumbrüche. RAW_VALUE ersetzt SFDMU durch den Originalwert.
const VALUE = /^[\p{L}\p{N} _.,:;/@#+&%=!?*<>|[\]~^-]{1,255}$/u;

export function checkStaticValue(input: string): string {
    const value = input.trim();
    if (!VALUE.test(value) || value.includes('RAW_VALUE')) {
        throw badRequest(
            'Ungültiger Wert: erlaubt sind Buchstaben, Ziffern, Leerzeichen und _ . , : ; / @ # + & % = ! ? * < > | [ ] ~ ^ -'
        );
    }
    return value;
}

// Feste Werte eines Eintrags: Träger und Wert, soweit Mock und Mapping zusammenpassen.
export function staticValuesOf(obj: ExportObject): Map<string, { target: string; value: string }> {
    const out = new Map<string, { target: string; value: string }>();
    if (!obj.updateWithMockData) return out;
    for (const m of obj.mockFields ?? []) {
        const value = PATTERN.exec(m.pattern)?.[1];
        const target = obj.fieldMapping?.find((f) => f.sourceField === m.name)?.targetField;
        if (value !== undefined && target) out.set(m.name, { target, value });
    }
    return out;
}

// Erstes freies, beschreibbares Textfeld der Quelle; Felder, die es im Ziel nicht gibt, zuerst.
export function pickCarrier(
    source: Record<string, DescribedField>,
    target: Record<string, DescribedField> | null,
    taken: Set<string>
): string | null {
    const candidates = Object.entries(source)
        .filter(([n, f]) => f.createable && f.baseType === 'string' && !taken.has(n.toLowerCase()))
        .map(([n]) => n)
        .sort((a, b) => {
            const rank = (n: string) => (target && !target[n] ? 0 : 1);
            return rank(a) - rank(b) || a.localeCompare(b);
        });
    return candidates[0] ?? null;
}

export async function setStaticValue(
    sfdmuDir: string,
    detail: ObjectDetail,
    { targetField, value }: Pick<StaticValueRequest, 'targetField' | 'value'>,
    source: DescribeResult,
    target: DescribeResult
): Promise<void> {
    const parentIndex = detail.parentIndex ?? undefined;
    if (detail.operation === 'Readonly') {
        throw conflict('Readonly-Einträge schreiben nichts, hier gibt es keine festen Werte.');
    }
    const existing = detail.fields.find(
        (f) => f.staticValue !== undefined && f.targetField === targetField
    );

    if (value === null) {
        if (!existing) return;
        await updateExport(sfdmuDir, detail.folder, (cfg) => {
            const obj = entryOf(cfg, parentIndex);
            const carrier = existing.name;
            const parsed = parseSoql(obj.query);
            if (!parsed.supported) throw conflict('Diese Query kann hier nicht bearbeitet werden.');
            obj.query = buildSoql({
                ...parsed,
                fields: parsed.fields.filter((f) => f.toLowerCase() !== carrier.toLowerCase())
            });
            const mappings = (obj.fieldMapping ?? []).filter((m) => m.sourceField !== carrier);
            if (mappings.length) obj.fieldMapping = mappings;
            else {
                delete obj.fieldMapping;
                delete obj.useFieldMapping;
            }
            const mocks = (obj.mockFields ?? []).filter((m) => m.name !== carrier);
            if (mocks.length) obj.mockFields = mocks;
            else {
                delete obj.mockFields;
                delete obj.updateWithMockData;
            }
        });
        return;
    }

    const clean = checkStaticValue(value);
    if (existing) {
        await updateExport(sfdmuDir, detail.folder, (cfg) => {
            const obj = entryOf(cfg, parentIndex);
            for (const m of obj.mockFields ?? []) {
                if (m.name === existing.name) m.pattern = staticPattern(clean);
            }
        });
        return;
    }

    if (!target.ok) throw conflict('Das Ziel muss lesbar sein, um das Zielfeld zu prüfen.');
    if (!source.ok) throw conflict('Die Quelle muss lesbar sein, um ein Trägerfeld zu finden.');
    const tf = target.fields[targetField];
    if (!tf) throw badRequest(`Zielfeld ${targetField} existiert im Ziel nicht.`);
    if (!tf.createable) throw badRequest(`Zielfeld ${targetField} ist im Ziel nicht schreibbar.`);
    const clash = detail.fields.find((f) => !f.excluded && f.targetField === targetField);
    if (clash) {
        throw conflict(
            `Zielfeld ${targetField} wird bereits von ${clash.name} befüllt. Erst dort das Mapping ändern oder das Feld ausschließen.`
        );
    }
    const taken = new Set(detail.fields.map((f) => f.name.toLowerCase()));
    const carrier = pickCarrier(source.fields, target.fields, taken);
    if (!carrier)
        throw conflict('In der Quelle ist kein freies Textfeld als technischer Träger übrig.');

    await updateExport(sfdmuDir, detail.folder, (cfg) => {
        const obj = entryOf(cfg, parentIndex);
        const parsed = parseSoql(obj.query);
        if (!parsed.supported) throw conflict('Diese Query kann hier nicht bearbeitet werden.');
        obj.query = buildSoql({ ...parsed, fields: [...parsed.fields, carrier] });
        obj.fieldMapping = [...(obj.fieldMapping ?? []), { sourceField: carrier, targetField }];
        obj.useFieldMapping = true;
        obj.mockFields = [
            ...(obj.mockFields ?? []),
            { name: carrier, pattern: staticPattern(clean) }
        ];
        obj.updateWithMockData = true;
    });
}
