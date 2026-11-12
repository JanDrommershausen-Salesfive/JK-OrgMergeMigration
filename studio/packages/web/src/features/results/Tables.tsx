import type { ErrorRow, MissingParentGroup, MissingParentRow, RecordRow } from '@studio/shared';
import { Fragment, useMemo, useState } from 'react';
import { useErrorRecord } from '../../api/queries';

const th =
    'sticky top-0 bg-white px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500 border-b border-grey-line';
const td = 'border-b border-grey-100 px-3 py-2 align-top text-sm';
const SHOWN = 200;

// Filterfeld und Zeilenlimit für lange Tabellen; gefiltert wird über alle Spalten.
function useFiltered<T extends object>(rows: T[]) {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q
            ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
            : rows;
    }, [rows, query]);
    return { query, setQuery, filtered, shown: filtered.slice(0, SHOWN) };
}

function Filter({
    query,
    onChange,
    count,
    total
}: {
    query: string;
    onChange: (q: string) => void;
    count: number;
    total: number;
}) {
    return (
        <div className="mb-3 flex items-center gap-3">
            <input
                type="search"
                value={query}
                placeholder="Filtern …"
                aria-label="Tabelle filtern"
                onChange={(e) => onChange(e.target.value)}
                className="w-64 rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm"
            />
            <span className="text-[13px] text-grey-500">
                {count === total ? `${total} Zeilen` : `${count} von ${total} Zeilen`}
                {count > SHOWN && `, angezeigt: ${SHOWN} (Rest im CSV-Export)`}
            </span>
        </div>
    );
}

interface Selection {
    selected: ReadonlySet<number>; // Positionen in der Fehlerliste des Laufs
    onChange: (next: Set<number>) => void;
}

// Fehlerliste mit Auswahl je Zeile (für die Übernahme in die To-Do-Liste). Die Position bleibt beim Filtern erhalten.
const isBlank = (v: string) => v === '' || v === '#N/A';

// Alle Felder, die für diese Zeile an die Ziel-Org gesendet wurden (zum Nachvollziehen eines Fehlers).
function SentFields({ run, index }: { run: RunRef; index: number }) {
    const record = useErrorRecord(run.folder, run.id, index, true);
    if (record.isPending) return <p className="m-0 text-[13px] text-grey-500">Lade …</p>;
    if (record.error)
        return (
            <p role="alert" className="m-0 text-[13px] text-bad">
                {record.error.message}
            </p>
        );
    const entries = Object.entries(record.data.fields);
    return (
        <dl className="m-0 grid max-h-80 grid-cols-[minmax(180px,max-content)_1fr] gap-x-4 gap-y-1 overflow-auto font-mono text-[12.5px]">
            {entries.map(([name, value]) => (
                <div key={name} className="contents">
                    <dt className="text-grey-500">{name}</dt>
                    <dd className={`m-0 break-all ${isBlank(value) ? 'text-grey-300' : ''}`}>
                        {isBlank(value) ? '—' : value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

interface RunRef {
    folder: string;
    id: string;
}

export function ErrorsTable({
    rows,
    total,
    selection,
    run
}: {
    rows: ErrorRow[];
    total: number;
    selection?: Selection;
    run?: RunRef; // mit Lauf: Zeilen lassen sich aufklappen und zeigen alle gesendeten Felder
}) {
    const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
    const toggleOpen = (index: number) =>
        setOpen((cur) => {
            const next = new Set(cur);
            if (!next.delete(index)) next.add(index);
            return next;
        });
    const indexed = useMemo(() => rows.map((r, index) => ({ ...r, index })), [rows]);
    const { query, setQuery, filtered, shown } = useFiltered(indexed);
    if (!total) return <p className="py-4 text-grey-500">Keine Fehler in den Ergebnisdateien.</p>;
    const sel = selection?.selected;
    const allShown = shown.length > 0 && shown.every((r) => sel?.has(r.index));
    const toggle = (index: number) => {
        if (!selection) return;
        const next = new Set(selection.selected);
        if (!next.delete(index)) next.add(index);
        selection.onChange(next);
    };
    const toggleAll = () => {
        if (!selection) return;
        const next = new Set(selection.selected);
        for (const r of shown) {
            if (allShown) next.delete(r.index);
            else next.add(r.index);
        }
        selection.onChange(next);
    };
    return (
        <>
            <Filter query={query} onChange={setQuery} count={filtered.length} total={total} />
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        {selection && (
                            <th className={th}>
                                <input
                                    type="checkbox"
                                    aria-label="Alle angezeigten Fehler wählen"
                                    checked={allShown}
                                    onChange={toggleAll}
                                />
                            </th>
                        )}
                        <th className={th}>Datei</th>
                        <th className={th}>Bezeichnung</th>
                        <th className={th}>Id</th>
                        <th className={th}>Fehler</th>
                        {run && <th className={th}>Felder</th>}
                    </tr>
                </thead>
                <tbody>
                    {shown.map((r) => (
                        <Fragment key={r.index}>
                            <tr className={sel?.has(r.index) ? 'bg-grey-100' : ''}>
                                {selection && (
                                    <td className={td}>
                                        <input
                                            type="checkbox"
                                            aria-label={`Fehler von ${r.label || r.oldId || r.id} wählen`}
                                            checked={sel?.has(r.index) ?? false}
                                            onChange={() => toggle(r.index)}
                                        />
                                    </td>
                                )}
                                <td className={td}>{r.file}</td>
                                <td className={td}>{r.label}</td>
                                <td className={`${td} font-mono text-[13px]`}>{r.oldId || r.id}</td>
                                <td className={`${td} text-bad`}>{r.error}</td>
                                {run && (
                                    <td className={td}>
                                        <button
                                            type="button"
                                            aria-expanded={open.has(r.index)}
                                            className="cursor-pointer rounded-lg border border-grey-line bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap"
                                            onClick={() => toggleOpen(r.index)}
                                        >
                                            {open.has(r.index) ? 'Ausblenden' : 'Alle Felder'}
                                        </button>
                                    </td>
                                )}
                            </tr>
                            {run && open.has(r.index) && (
                                <tr>
                                    <td
                                        className={`${td} bg-grey-100`}
                                        colSpan={(selection ? 1 : 0) + 5}
                                    >
                                        <SentFields run={run} index={r.index} />
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </>
    );
}

export function MissingParentsTable({
    groups,
    rows,
    total
}: {
    groups: MissingParentGroup[];
    rows: MissingParentRow[];
    total: number;
}) {
    const { query, setQuery, filtered, shown } = useFiltered(groups);
    if (!total) return <p className="py-4 text-grey-500">Keine fehlenden Parents.</p>;
    return (
        <>
            <p className="mb-3 text-[13px] text-grey-500">
                {total} Datensätze verweisen auf einen Parent, der im Ziel nicht gefunden wurde.
                Nach fehlendem Wert gruppiert (häufigste zuerst); die einzelnen Datensätze stehen im
                CSV-Export.
                {rows.length < total && ' Die Liste ist gekürzt.'}
            </p>
            <Filter
                query={query}
                onChange={setQuery}
                count={filtered.length}
                total={groups.length}
            />
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className={th}>Lookup-Feld</th>
                        <th className={th}>Parent-Objekt</th>
                        <th className={th}>Fehlender Wert</th>
                        <th className={`${th} text-right`}>Datensätze</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((g, i) => (
                        <tr key={i}>
                            <td className={`${td} font-mono text-[13px]`}>{g.lookupField}</td>
                            <td className={td}>{g.parentObject}</td>
                            <td className={td}>{g.value}</td>
                            <td className={`${td} text-right`}>{g.records}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Erfolgreich geschriebene Datensätze eines Laufs; der vollständige Stand steht im CSV-Export.
export function RecordsTable({ rows, total }: { rows: RecordRow[]; total: number }) {
    const { query, setQuery, filtered, shown } = useFiltered(rows);
    if (!total) return <p className="py-4 text-grey-500">Keine Datensätze.</p>;
    return (
        <>
            <Filter query={query} onChange={setQuery} count={filtered.length} total={total} />
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className={th}>Bezeichnung</th>
                        <th className={th}>Id im Ziel</th>
                        <th className={th}>Id in der Quelle</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
                            <td className={td}>{r.label}</td>
                            <td className={`${td} font-mono text-[13px]`}>{r.id}</td>
                            <td className={`${td} font-mono text-[13px]`}>{r.oldId}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
