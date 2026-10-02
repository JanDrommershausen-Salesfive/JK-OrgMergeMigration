import type { ErrorRow, MissingParentGroup, MissingParentRow } from '@studio/shared';
import { useMemo, useState } from 'react';

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

export function ErrorsTable({ rows, total }: { rows: ErrorRow[]; total: number }) {
    const { query, setQuery, filtered, shown } = useFiltered(rows);
    if (!total) return <p className="py-4 text-grey-500">Keine Fehler in den Ergebnisdateien.</p>;
    return (
        <>
            <Filter query={query} onChange={setQuery} count={filtered.length} total={total} />
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className={th}>Datei</th>
                        <th className={th}>Bezeichnung</th>
                        <th className={th}>Id</th>
                        <th className={th}>Fehler</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((r, i) => (
                        <tr key={i}>
                            <td className={td}>{r.file}</td>
                            <td className={td}>{r.label}</td>
                            <td className={`${td} font-mono text-[13px]`}>{r.oldId || r.id}</td>
                            <td className={`${td} text-bad`}>{r.error}</td>
                        </tr>
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
