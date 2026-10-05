import type { Cohort } from '@studio/shared';
import { useState } from 'react';
import {
    useCohortPreview,
    useCohortRecords,
    useDeleteCohort,
    useDeleteSeries
} from '../../api/queries';
import { Button } from '../../components/ui';
import { CohortRecords } from './CohortRecords';
import { CompositionCard, ContentsCard } from './CohortSummary';
import { estimateMb } from './cohortText';

const th = 'px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-t border-grey-100 px-3 py-2 text-sm';

export function CohortDetail({ cohort, onDeleted }: { cohort: Cohort; onDeleted: () => void }) {
    const [wanted, setWanted] = useState(false);
    const preview = useCohortPreview(cohort.id, wanted);
    const records = useCohortRecords(cohort.id, true); // eine Abfrage, deshalb gleich beim Öffnen
    const del = useDeleteCohort();
    const delSeries = useDeleteSeries();
    const [confirmSeries, setConfirmSeries] = useState(false);
    const rows = preview.data?.rows ?? [];
    const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);

    return (
        <div className="p-6">
            <div className="mb-4">
                <h2 className="m-0 text-[24px] leading-tight font-normal tracking-tighter">
                    {cohort.name}
                </h2>
                <p className="mt-1 mb-0 text-[13px] text-grey-500">
                    {cohort.count} {cohort.rootObject} · angelegt{' '}
                    {new Date(cohort.createdAt).toLocaleString('de-DE')}
                </p>
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-2">
                <CompositionCard cohort={cohort} />
                <ContentsCard records={records.data} />
            </div>

            <div className="mb-6">
                <CohortRecords
                    cohort={cohort}
                    records={records.data}
                    loading={records.isFetching}
                    error={records.error?.message ?? null}
                />
            </div>

            <section
                aria-label="Umfang je Objekt"
                className="mb-6 rounded-xl border border-grey-line p-4"
            >
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="m-0 text-sm font-bold">Umfang je Objekt</h3>
                        <p className="mt-1 mb-0 text-[13px] text-grey-500">
                            Zählt für jedes Migrationsobjekt, wie viele Datensätze zur Kohorte
                            gehören, und schätzt den Speicher in der Sandbox. Das sind viele
                            Abfragen in der Quelle und dauert etwa eine Minute.
                        </p>
                    </div>
                    <Button
                        variant={wanted ? 'ghost' : 'primary'}
                        small
                        disabled={preview.isFetching}
                        onClick={() => (wanted ? void preview.refetch() : setWanted(true))}
                    >
                        {preview.isFetching
                            ? 'Zähle in der Quelle …'
                            : wanted
                              ? 'Neu zählen'
                              : 'Vorschau berechnen'}
                    </Button>
                </div>
                {preview.error && (
                    <p role="alert" className="mt-3 mb-0 text-[13px] text-bad">
                        {preview.error.message}
                    </p>
                )}
                {rows.length > 0 && (
                    <>
                        <table className="mt-3 w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className={th}>Objekt</th>
                                    <th className={`${th} text-right`}>Datensätze</th>
                                    <th className={th}>Verknüpft über</th>
                                    <th className={th}>Hinweis</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.folder}>
                                        <td className={td}>{r.folder.replace('_', ' · ')}</td>
                                        <td className={`${td} text-right`}>{r.count ?? '–'}</td>
                                        <td className={`${td} font-mono text-[13px] text-grey-500`}>
                                            {r.via ?? ''}
                                        </td>
                                        <td
                                            className={`${td} text-[13px] ${r.scoped ? 'text-grey-500' : 'text-warn'}`}
                                        >
                                            {r.scoped
                                                ? (r.note ?? '')
                                                : (r.note ?? 'folgt der Kohorte nicht')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-3 mb-0 text-sm">
                            Zusammen <b>{total}</b> Datensätze, grob <b>{estimateMb(total)}</b>{' '}
                            Speicher in der Sandbox
                            <span className="text-[13px] text-grey-500">
                                {' '}
                                (Schätzung mit 2 KB je Datensatz, ohne Dateien und Parents, die
                                mitgezogen werden)
                            </span>
                            .
                        </p>
                        <p className="mt-1 mb-0 text-[13px] text-grey-500">
                            Objekte, die der Kohorte nicht folgen (Stammdaten wie Product2 oder
                            Objekte ohne Account-Bezug), starten mit dieser Kohorte nicht und laufen
                            ohne Kohorte vollständig.
                        </p>
                    </>
                )}
            </section>

            <div className="border-t border-grey-line pt-4">
                <Button
                    variant="ghost"
                    small
                    disabled={del.isPending}
                    onClick={() => del.mutate(cohort.id, { onSuccess: onDeleted })}
                >
                    Kohorte löschen
                </Button>
                {cohort.series &&
                    (confirmSeries ? (
                        <span className="ml-3 text-[13px]">
                            Alle {cohort.series.total} Kohorten der Serie löschen?{' '}
                            <Button
                                variant="danger"
                                small
                                disabled={delSeries.isPending}
                                onClick={() =>
                                    delSeries.mutate(cohort.series!.id, { onSuccess: onDeleted })
                                }
                            >
                                Ja, Serie löschen
                            </Button>{' '}
                            <Button variant="ghost" small onClick={() => setConfirmSeries(false)}>
                                Abbrechen
                            </Button>
                        </span>
                    ) : (
                        <Button
                            variant="ghost"
                            small
                            className="ml-3"
                            onClick={() => setConfirmSeries(true)}
                        >
                            Ganze Serie löschen
                        </Button>
                    ))}
                {delSeries.isError && (
                    <span role="alert" className="ml-3 text-[13px] text-bad">
                        {delSeries.error.message}
                    </span>
                )}
                {del.isError && (
                    <span role="alert" className="ml-3 text-[13px] text-bad">
                        {del.error.message}
                    </span>
                )}
            </div>
        </div>
    );
}
