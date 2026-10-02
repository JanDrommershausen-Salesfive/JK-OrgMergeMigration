import type { DescribedField, Filter, FilterValue } from '@studio/shared';
import {
    RELATIVE_DATES,
    choiceOf,
    defaultValue,
    inputKind,
    listToText,
    operatorChoices,
    textToList
} from './filterModel';

const input = 'rounded-lg border border-grey-line bg-white px-2 py-1.5 text-sm';

interface Props {
    filter: Filter;
    fields: Record<string, DescribedField> | null; // Quelle (Describe), null: nicht verfügbar
    disabled: boolean;
    onChange: (next: Filter) => void;
    onRemove: () => void;
}

function RelativeDate({
    value,
    onChange,
    disabled
}: {
    value: string;
    onChange: (v: FilterValue) => void;
    disabled: boolean;
}) {
    const [name = 'TODAY', n = ''] = value.split(':');
    const known = RELATIVE_DATES.find((d) => d.id === name);
    return (
        <>
            <select
                className={input}
                disabled={disabled}
                value={name}
                aria-label="Zeitraum"
                onChange={(e) => {
                    const d = RELATIVE_DATES.find((x) => x.id === e.target.value);
                    onChange({
                        kind: 'literal',
                        value: d?.needsN ? `${d.id}:${n || '7'}` : e.target.value
                    });
                }}
            >
                {!known && <option value={name}>{name}</option>}
                {RELATIVE_DATES.map((d) => (
                    <option key={d.id} value={d.id}>
                        {d.label}
                    </option>
                ))}
            </select>
            {known?.needsN && (
                <input
                    className={`${input} w-20`}
                    type="number"
                    min={1}
                    disabled={disabled}
                    value={n}
                    aria-label="Anzahl Tage"
                    onChange={(e) =>
                        onChange({ kind: 'literal', value: `${name}:${e.target.value}` })
                    }
                />
            )}
        </>
    );
}

function ValueEditor({
    filter,
    disabled,
    onChange
}: {
    filter: Filter;
    disabled: boolean;
    onChange: (v: FilterValue) => void;
}) {
    const v = filter.value;
    if (v.kind === 'null') return null;
    if (v.kind === 'boolean') {
        return (
            <select
                className={input}
                disabled={disabled}
                value={String(v.value)}
                aria-label="Wert"
                onChange={(e) => onChange({ kind: 'boolean', value: e.target.value === 'true' })}
            >
                <option value="true">wahr</option>
                <option value="false">falsch</option>
            </select>
        );
    }
    if (v.kind === 'literal')
        return <RelativeDate value={v.value} disabled={disabled} onChange={onChange} />;
    if (v.kind === 'date') {
        return (
            <input
                className={input}
                type="date"
                disabled={disabled}
                value={v.value.slice(0, 10)}
                aria-label="Datum"
                onChange={(e) => onChange({ kind: 'date', value: e.target.value })}
            />
        );
    }
    if (v.kind === 'number') {
        return (
            <input
                className={`${input} w-32`}
                type="number"
                disabled={disabled}
                value={v.value}
                aria-label="Zahl"
                onChange={(e) => onChange({ kind: 'number', value: e.target.value })}
            />
        );
    }
    if (v.kind === 'list') {
        return (
            <input
                className={`${input} min-w-64`}
                disabled={disabled}
                value={listToText(v)}
                placeholder="Werte, durch Komma getrennt"
                aria-label="Werte"
                onChange={(e) => onChange(textToList(e.target.value))}
            />
        );
    }
    return (
        <input
            className={`${input} min-w-64`}
            disabled={disabled}
            value={v.value}
            aria-label="Wert"
            onChange={(e) => onChange({ kind: 'string', value: e.target.value })}
        />
    );
}

export function FilterRow({ filter, fields, disabled, onChange, onRemove }: Props) {
    const kind = inputKind(fields?.[filter.field]);
    const choice = choiceOf(filter, kind);
    const names = fields ? Object.keys(fields).sort((a, b) => a.localeCompare(b)) : [];
    if (!names.includes(filter.field)) names.unshift(filter.field);

    const changeOperator = (id: string) => {
        const next = operatorChoices(kind).find((o) => o.id === id);
        if (!next) return;
        if (next.empty) return onChange({ ...filter, op: next.op, value: { kind: 'null' } });
        const wasEmpty = filter.value.kind === 'null';
        const wantsList = next.op === 'IN' || next.op === 'NOT IN';
        const value = wantsList
            ? filter.value.kind === 'list'
                ? filter.value
                : textToList('')
            : filter.value.kind === 'list' || wasEmpty
              ? defaultValue(kind)
              : filter.value;
        onChange({ ...filter, op: next.op, value });
    };
    const changeField = (field: string) => {
        const nextKind = inputKind(fields?.[field]);
        onChange({ field, op: '=', value: defaultValue(nextKind) });
    };

    return (
        <div className="mb-2 flex flex-wrap items-center gap-2">
            <select
                className={`${input} max-w-56 font-mono text-[13px]`}
                disabled={disabled}
                value={filter.field}
                aria-label="Feld"
                onChange={(e) => changeField(e.target.value)}
            >
                {names.map((n) => (
                    <option key={n} value={n}>
                        {n}
                    </option>
                ))}
            </select>
            <select
                className={input}
                disabled={disabled}
                value={choice.id}
                aria-label="Bedingung"
                onChange={(e) => changeOperator(e.target.value)}
            >
                {operatorChoices(kind).map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ValueEditor
                filter={filter}
                disabled={disabled}
                onChange={(value) => onChange({ ...filter, value })}
            />
            <button
                type="button"
                disabled={disabled}
                aria-label={`Bedingung ${filter.field} entfernen`}
                title="Bedingung entfernen"
                className="size-7 cursor-pointer rounded-full border border-grey-line text-grey-500 hover:border-bad hover:bg-bad-soft hover:text-bad disabled:opacity-40"
                onClick={onRemove}
            >
                ×
            </button>
        </div>
    );
}
