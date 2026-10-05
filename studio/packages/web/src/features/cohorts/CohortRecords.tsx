import type { Cohort, QuickQueryResult } from '@studio/shared';
import { useMemo, useState } from 'react';

const th =
    'sticky top-0 border-b border-grey-line bg-white px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-b border-grey-100 px-3 py-1.5 text-sm';

interface Props {
    cohort: Cohort;
    records: QuickQueryResult | undefined;
    loading: boolean;
    error: string | null;
}

// Die Datensätze einer Kohorte, live aus der Quelle. Die Kohorte speichert nur Ids; hier sieht man, welche Accounts das sind.
export function CohortRecords({ cohort, records, loading, error }: Props) {
    const [filter, setFilter] = useState('');
    const rows = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return !records
            ? []
            : q
              ? records.rows.filter((r) => r.some((v) => v.toLowerCase().includes(q)))
              : records.rows;
    }, [records, filter]);

    return (
        <section aria-label="Datensätze der Kohorte">
            <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="m-0 text-sm font-bold">Datensätze</h3>
                {records && (
                    <>
                        <input
                            type="search"
                            aria-label="Datensätze filtern"
                            placeholder="Filtern …"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-56 rounded-lg border border-grey-line bg-white px-2.5 py-1 text-sm"
                        />
                        <span className="text-[13px] text-grey-500">
                            {rows.length === records.rows.length
                                ? `${records.rows.length} Datensätze`
                                : `${rows.length} von ${records.rows.length}`}
                            {records.rows.length < cohort.count &&
                                ` · ${cohort.count - records.rows.length} der festen Ids gibt es in der Quelle nicht mehr`}
                        </span>
                    </>
                )}
                {loading && (
                    <span className="text-[13px] text-grey-500">Lade aus der Quelle …</span>
                )}
            </div>
            {error && (
                <p role="alert" className="text-[13px] text-bad">
                    {error}
                </p>
            )}
            {records && (
                <div className="max-h-[50vh] overflow-auto rounded-xl border border-grey-line">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {records.columns.map((c) => (
                                    <th key={c} className={th}>
                                        {c}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r[0]}>
                                    {r.map((v, i) => (
                                        <td
                                            key={i}
                                            className={`${td} ${i === 0 ? 'font-mono text-[13px] text-grey-500' : ''}`}
                                        >
                                            {v}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
