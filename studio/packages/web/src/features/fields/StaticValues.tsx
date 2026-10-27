import type { DescribedField, ObjectDetail } from '@studio/shared';
import { useState } from 'react';
import { useSaveStaticValue } from '../../api/queries';
import { Button } from '../../components/ui';
import type { Report } from '../detail/saveMessage';

interface Props {
    detail: ObjectDetail;
    target: Record<string, DescribedField>;
    running: boolean;
    report: Report;
}

const control =
    'w-full max-w-[300px] rounded-lg border border-grey-line bg-white px-1.5 py-1 text-[13px] text-ink';

// Zielfelder, die ein fester Wert noch befüllen kann: schreibbar und von keinem Quellfeld belegt.
export function staticTargets(detail: ObjectDetail, target: Record<string, DescribedField>) {
    const used = new Set(detail.fields.filter((f) => !f.excluded).map((f) => f.targetField));
    return Object.keys(target)
        .filter((n) => target[n]?.createable && !used.has(n))
        .sort((a, b) => a.localeCompare(b));
}

// Wert eines Zielfelds: Auswahl, wenn das Zielfeld eine Picklist ist, sonst freier Text.
function ValueInput({
    field,
    value,
    onChange,
    onCommit,
    disabled,
    label
}: {
    field: DescribedField | undefined;
    value: string;
    onChange: (v: string) => void;
    onCommit?: (v: string) => void;
    disabled: boolean;
    label: string;
}) {
    const values = field?.picklistValues;
    if (values?.length) {
        const known = values.includes(value) || value === '';
        return (
            <select
                value={value}
                aria-label={label}
                disabled={disabled}
                className={control}
                onChange={(e) => {
                    onChange(e.target.value);
                    onCommit?.(e.target.value);
                }}
            >
                <option value="">Wert wählen …</option>
                {!known && <option value={value}>{value} (nicht im Ziel)</option>}
                {values.map((v) => (
                    <option key={v} value={v}>
                        {v}
                    </option>
                ))}
            </select>
        );
    }
    return (
        <input
            value={value}
            aria-label={label}
            disabled={disabled}
            placeholder="Wert"
            className={control}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit?.(value)}
        />
    );
}

function StaticRow({
    targetField,
    saved,
    described,
    disabled,
    save,
    remove
}: {
    targetField: string;
    saved: string;
    described: DescribedField | undefined;
    disabled: boolean;
    save: (field: string, value: string) => void;
    remove: (field: string) => void;
}) {
    const [value, setValue] = useState(saved);
    return (
        <li className="flex flex-wrap items-center gap-2 py-1">
            <span className="min-w-40 font-mono text-[13px]">{targetField}</span>
            <span className="text-grey-500">=</span>
            <ValueInput
                field={described}
                value={value}
                label={`Fester Wert für ${targetField}`}
                disabled={disabled}
                onChange={setValue}
                onCommit={(v) => v.trim() && v.trim() !== saved && save(targetField, v)}
            />
            <button
                type="button"
                className="size-6 flex-none cursor-pointer rounded-full border border-grey-line text-base leading-[22px] text-grey-500 hover:border-bad hover:bg-bad-soft hover:text-bad disabled:opacity-40"
                title="Festen Wert entfernen"
                aria-label={`Festen Wert für ${targetField} entfernen`}
                disabled={disabled}
                onClick={() => remove(targetField)}
            >
                ×
            </button>
        </li>
    );
}

// Zielfelder, die die Quelle nicht kennt, mit einem festen Wert für alle Datensätze befüllen
// (zum Beispiel CurrencyIsoCode = USD). Technisch trägt ein verstecktes Quellfeld den Wert.
export function StaticValues({ detail, target, running, report }: Props) {
    const save = useSaveStaticValue(detail.folder);
    const [field, setField] = useState('');
    const [value, setValue] = useState('');
    const statics = detail.fields.filter((f) => f.staticValue !== undefined);
    const targets = staticTargets(detail, target);
    const busy = running || save.isPending;
    const parentIndex = detail.parentIndex ?? undefined;
    if (detail.operation === 'Readonly') return null;

    const send = (targetField: string, v: string | null, done: string) => {
        report('Speichere …');
        save.mutate(
            { folder: detail.folder, parentIndex, targetField, value: v },
            {
                onSuccess: () => report(`✓ ${done}`),
                onError: (e) => report(e.message, true)
            }
        );
    };

    return (
        <section
            className="mt-4 rounded-xl border border-grey-line px-4 py-3"
            aria-label="Feste Werte"
        >
            <h4 className="mb-1 text-sm font-bold">Feste Werte ({statics.length})</h4>
            <p className="mt-0 mb-2 text-[13px] text-grey-500">
                Ein Zielfeld, das es in der Quelle nicht gibt, mit demselben Wert für alle
                Datensätze befüllen. Der Wert gilt bei jedem Lauf, auch beim Aktualisieren
                vorhandener Datensätze.
            </p>
            {statics.length > 0 && (
                <ul className="m-0 mb-2 list-none p-0">
                    {statics.map((f) => (
                        <StaticRow
                            key={`${f.targetField}:${f.staticValue}`}
                            targetField={f.targetField}
                            saved={f.staticValue ?? ''}
                            described={target[f.targetField]}
                            disabled={busy}
                            save={(t, v) => send(t, v, `${t} = ${v.trim()} gespeichert`)}
                            remove={(t) => send(t, null, `Fester Wert für ${t} entfernt`)}
                        />
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={field}
                    aria-label="Zielfeld für festen Wert"
                    disabled={busy || !targets.length}
                    className={control}
                    onChange={(e) => {
                        setField(e.target.value);
                        setValue('');
                    }}
                >
                    <option value="">
                        {targets.length ? 'Zielfeld wählen …' : 'Keine freien Zielfelder'}
                    </option>
                    {targets.map((n) => (
                        <option key={n} value={n}>
                            {n} · {target[n]?.type.slice(0, 28)}
                        </option>
                    ))}
                </select>
                <span className="text-grey-500">=</span>
                <ValueInput
                    field={target[field]}
                    value={value}
                    label="Fester Wert für neues Zielfeld"
                    disabled={busy || !field}
                    onChange={setValue}
                />
                <Button
                    small
                    disabled={busy || !field || !value.trim()}
                    onClick={() => {
                        send(field, value, `${field} = ${value.trim()} gespeichert`);
                        setField('');
                        setValue('');
                    }}
                >
                    Hinzufügen
                </Button>
            </div>
        </section>
    );
}
