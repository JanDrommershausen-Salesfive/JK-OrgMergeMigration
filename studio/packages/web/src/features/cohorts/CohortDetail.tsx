import type { Cohort } from '@studio/shared';
import { useState } from 'react';
import { useCohortPreview, useDeleteCohort } from '../../api/queries';
import { Button, Tag } from '../../components/ui';
import { estimateMb, ruleText } from './cohortText';

const th = 'px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-t border-grey-100 px-3 py-2 text-sm';

export function CohortDetail({ cohort, onDeleted }: { cohort: Cohort; onDeleted: () => void }) {
    const [wanted, setWanted] = useState(false);
    const preview = useCohortPreview(cohort.id, wanted);
    const del = useDeleteCohort();
    const rows = preview.data?.rows ?? [];
    const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);

    return (
        <div className="p-6">
            <div className="mb-1 flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] leading-tight font-normal tracking-tighter">
                    {cohort.name}
                </h2>
                <Tag>{ruleText(cohort)}</Tag>
            </div>
            <p className="mb-4 text-[13px] text-grey-500">
                {cohort.count} {cohort.rootObject} · angelegt{' '}
                {new Date(cohort.createdAt).toLocaleString('de-DE')} · eingefroren, ändert sich
                nicht
            </p>

            <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-bold">Umfang je Objekt</h3>
                <Button
                    variant="ghost"
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
                <span className="text-[13px] text-grey-500">Liest nur aus der Quelle.</span>
            </div>
            {preview.error && (
                <p role="alert" className="text-[13px] text-bad">
                    {preview.error.message}
                </p>
            )}
            {rows.length > 0 && (
                <>
                    <table className="w-full border-collapse">
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
                    <p className="mt-3 text-sm">
                        Zusammen <b>{total}</b> Datensätze, grob <b>{estimateMb(total)}</b> Speicher
                        in der Sandbox
                        <span className="text-[13px] text-grey-500">
                            {' '}
                            (Schätzung mit 2 KB je Datensatz, ohne Dateien und Parents, die
                            mitgezogen werden)
                        </span>
                        .
                    </p>
                    <p className="mt-1 text-[13px] text-grey-500">
                        Objekte, die der Kohorte nicht folgen (Stammdaten wie Product2 oder Objekte
                        ohne Account-Bezug), starten mit dieser Kohorte nicht und laufen ohne
                        Kohorte vollständig.
                    </p>
                </>
            )}

            <div className="mt-6 border-t border-grey-line pt-4">
                <Button
                    variant="ghost"
                    small
                    disabled={del.isPending}
                    onClick={() => del.mutate(cohort.id, { onSuccess: onDeleted })}
                >
                    Kohorte löschen
                </Button>
                {del.isError && (
                    <span role="alert" className="ml-3 text-[13px] text-bad">
                        {del.error.message}
                    </span>
                )}
            </div>
        </div>
    );
}
