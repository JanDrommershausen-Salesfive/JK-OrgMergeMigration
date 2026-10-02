import type { ObjectDetail, ValueMappingRow } from '@studio/shared';
import { useRef, useState } from 'react';
import { useSaveValueMapping } from '../../api/queries';
import { Button, Tag } from '../../components/ui';
import type { Report } from '../detail/saveMessage';

interface Props {
    detail: ObjectDetail;
    filterField: string | null;
    running: boolean;
    report: Report;
    onFilterChange: (field: string | null) => void;
}

type Row = { from: string; to: string };

const input =
    'min-w-0 max-w-80 flex-1 rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm text-ink';

function ValueGroup({
    field,
    saved,
    detail,
    running,
    report
}: {
    field: string;
    saved: ValueMappingRow[];
    detail: ObjectDetail;
    running: boolean;
    report: Report;
}) {
    const save = useSaveValueMapping();
    const initial: Row[] = saved.length
        ? saved.map(({ from, to }) => ({ from, to }))
        : [{ from: '', to: '' }];
    const [rows, setRows] = useState<Row[]>(initial);
    const clean = (r: Row[]) => JSON.stringify(r.filter((x) => x.from.trim() !== ''));
    const lastSaved = useRef(clean(initial));

    const persist = (next: Row[]) => {
        if (clean(next) === lastSaved.current) return; // nichts geändert
        lastSaved.current = clean(next);
        report('Speichere …');
        save.mutate(
            { folder: detail.folder, field, rows: next },
            {
                onSuccess: () => report(`✓ ValueMapping.csv gespeichert (${field})`),
                onError: (e) => report(e.message, true)
            }
        );
    };
    const update = (i: number, key: keyof Row, value: string) =>
        setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
    const remove = (i: number) => {
        const next = rows.filter((_, j) => j !== i);
        setRows(next.length ? next : [{ from: '', to: '' }]);
        persist(next);
    };

    return (
        <section className="mb-3 rounded-xl border border-grey-line px-4 py-3" data-field={field}>
            <h4 className="mb-2 font-mono text-sm font-bold">{field}</h4>
            {rows.map((row, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                        className={input}
                        value={row.from}
                        placeholder="Quellwert"
                        aria-label="Quellwert"
                        disabled={running}
                        onChange={(e) => update(i, 'from', e.target.value)}
                        onBlur={() => persist(rows)}
                    />
                    <span className="text-grey-500">→</span>
                    <input
                        className={input}
                        value={row.to}
                        placeholder="Zielwert"
                        aria-label="Zielwert"
                        disabled={running}
                        onChange={(e) => update(i, 'to', e.target.value)}
                        onBlur={() => persist(rows)}
                    />
                    <button
                        type="button"
                        className="size-6 flex-none cursor-pointer rounded-full border border-grey-line text-base leading-[22px] text-grey-500 hover:border-bad hover:bg-bad-soft hover:text-bad disabled:opacity-40"
                        title="Zeile löschen"
                        aria-label="Zeile löschen"
                        disabled={running}
                        onClick={() => remove(i)}
                    >
                        ×
                    </button>
                </div>
            ))}
            <Button
                variant="ghost"
                small
                disabled={running}
                onClick={() => setRows((r) => [...r, { from: '', to: '' }])}
            >
                + Zeile
            </Button>
        </section>
    );
}

export function ValuesTab({ detail, filterField, running, report, onFilterChange }: Props) {
    const [drafts, setDrafts] = useState<string[]>([]);
    const [newField, setNewField] = useState('');

    const saved = new Map<string, ValueMappingRow[]>();
    for (const m of detail.valueMappings) saved.set(m.field, [...(saved.get(m.field) ?? []), m]);
    const names = [
        ...new Set([...saved.keys(), ...drafts, ...(filterField ? [filterField] : [])])
    ].filter((n) => !filterField || n === filterField);
    const free = detail.fields
        .map((f) => f.name)
        .filter((n) => n !== 'Id' && !names.includes(n) && !saved.has(n));

    return (
        <>
            <p className="mb-3 text-[13px] text-grey-500">
                Werte, die beim Schreiben ins Ziel ersetzt werden (Quellwert → Zielwert). Änderungen
                speichern sofort in <span className="font-mono">sfdmu/ValueMapping.csv</span>, die
                Datei gilt für alle Objekte.
            </p>
            {filterField && (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-grey-500">
                    <Tag tone="map">Feld: {filterField}</Tag>
                    <Button variant="ghost" small onClick={() => onFilterChange(null)}>
                        Alle Felder anzeigen
                    </Button>
                </p>
            )}
            {names.length ? (
                names.map((n) => (
                    <ValueGroup
                        key={`${detail.folder}:${n}`}
                        field={n}
                        saved={saved.get(n) ?? []}
                        detail={detail}
                        running={running}
                        report={report}
                    />
                ))
            ) : (
                <p className="py-6 text-grey-500">
                    Für dieses Objekt sind keine Werte-Ersetzungen hinterlegt.
                </p>
            )}
            {free.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                    <select
                        value={newField || free[0]}
                        onChange={(e) => setNewField(e.target.value)}
                        aria-label="Feld für neues Wertemapping"
                        className="max-w-60 rounded-lg border border-grey-line bg-white px-1.5 py-1 font-mono text-[13px]"
                    >
                        {free.map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                    <Button
                        variant="ghost"
                        small
                        disabled={running}
                        onClick={() => setDrafts((d) => [...d, newField || (free[0] as string)])}
                    >
                        + Wertemapping für Feld
                    </Button>
                </div>
            )}
        </>
    );
}
