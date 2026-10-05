import type { Cohort, QuickQueryResult } from '@studio/shared';
import { distinctValues } from '../quick/distinct';
import { nodeText } from './cohortText';

const card = 'rounded-xl border border-grey-line p-4';

// Wie die Kohorte zusammengesetzt ist: die Regel in Worten (Stichprobe, Filter, feste Ids).
export function CompositionCard({ cohort }: { cohort: Cohort }) {
    const rule = cohort.rule;
    return (
        <section aria-label="Zusammensetzung" className={card}>
            <h3 className="mb-2 text-xs font-bold text-digital-blue">ZUSAMMENSETZUNG</h3>
            {cohort.series ? (
                <>
                    <p className="m-0 text-base font-bold">
                        Block {cohort.series.index} von {cohort.series.total} der Serie „
                        {cohort.series.name}“
                    </p>
                    <p className="mt-2 mb-1 text-[13px] text-grey-500">
                        Alle {cohort.rootObject}s der Quelle nach Erstelldatum sortiert (älteste
                        zuerst) und in feste Blöcke geschnitten. Jede Id steckt in genau einem
                        Block.
                        {cohort.series.filters.length > 0 && ' Eingegrenzt auf:'}
                    </p>
                    {cohort.series.filters.length > 0 && (
                        <ul className="m-0 list-none space-y-1 p-0">
                            {cohort.series.filters.map((n, i) => (
                                <li
                                    key={i}
                                    className="rounded-lg bg-grey-100 px-3 py-1 font-mono text-[13px]"
                                >
                                    {nodeText(n)}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            ) : rule.kind === 'sample' ? (
                <>
                    <p className="m-0 text-base font-bold">
                        Zufällige Stichprobe: {rule.size} {cohort.rootObject}
                    </p>
                    {rule.filters.length ? (
                        <>
                            <p className="mt-2 mb-1 text-[13px] text-grey-500">
                                Nur aus {cohort.rootObject}s, bei denen alle Bedingungen zutreffen:
                            </p>
                            <ul className="m-0 list-none space-y-1 p-0">
                                {rule.filters.map((n, i) => (
                                    <li
                                        key={i}
                                        className="rounded-lg bg-grey-100 px-3 py-1 font-mono text-[13px]"
                                    >
                                        {nodeText(n)}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="mt-2 mb-0 text-[13px] text-grey-500">
                            Ohne Filter: gezogen aus allen {cohort.rootObject}s der Quelle.
                        </p>
                    )}
                </>
            ) : (
                <>
                    <p className="m-0 text-base font-bold">
                        Feste Liste: {rule.ids.length} {cohort.rootObject}-Ids
                    </p>
                    <p className="mt-2 mb-0 text-[13px] text-grey-500">
                        Die Ids wurden vorgegeben (eingefügt oder aus einer Liste übernommen).
                    </p>
                </>
            )}
            <p className="mt-3 mb-0 text-[13px] text-grey-500">
                Angelegt am {new Date(cohort.createdAt).toLocaleString('de-DE')}. Die Auswahl ist
                eingefroren und ändert sich nicht, auch wenn sich die Quelle ändert. Alle abhängigen
                Objekte (Contact, Opportunity …) folgen diesen {cohort.count} {cohort.rootObject}s.
            </p>
        </section>
    );
}

const FACETS = [
    { column: 'Type', label: 'Typ' },
    { column: 'Industry', label: 'Branche' },
    { column: 'BillingCountry', label: 'Land' },
    { column: 'BillingState', label: 'State' }
];

// Auf einen Blick, was in der Kohorte steckt: häufigste Werte wichtiger Felder, aus den geladenen Datensätzen.
export function ContentsCard({ records }: { records: QuickQueryResult | undefined }) {
    return (
        <section aria-label="Inhalt" className={card}>
            <h3 className="mb-2 text-xs font-bold text-digital-blue">INHALT</h3>
            {!records ? (
                <p className="m-0 text-[13px] text-grey-500">Lade Datensätze aus der Quelle …</p>
            ) : (
                <div className="space-y-2 text-[13px]">
                    {FACETS.map(({ column, label }) => {
                        const i = records.columns.indexOf(column);
                        const values =
                            i < 0 ? [] : distinctValues(records.columns, records.rows, i);
                        const filled = values.filter((v) => v.value !== '');
                        const empty = values.find((v) => v.value === '')?.count ?? 0;
                        return (
                            <div
                                key={column}
                                className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                            >
                                <span className="w-14 flex-none text-grey-500">{label}</span>
                                {filled.length === 0 ? (
                                    <span className="text-grey-500">keine Werte</span>
                                ) : (
                                    filled.slice(0, 4).map((v) => (
                                        <span
                                            key={v.value}
                                            className="rounded-full bg-grey-100 px-2 py-px"
                                        >
                                            {v.value} <b>{v.count}</b>
                                        </span>
                                    ))
                                )}
                                {filled.length > 4 && (
                                    <span className="text-grey-500">
                                        +{filled.length - 4} weitere
                                    </span>
                                )}
                                {empty > 0 && filled.length > 0 && (
                                    <span className="text-grey-500">· {empty} ohne Wert</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
