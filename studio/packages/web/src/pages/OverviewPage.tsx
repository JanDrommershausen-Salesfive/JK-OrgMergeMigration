import { useState } from 'react';
import { Link } from 'react-router';
import { useObjects } from '../api/queries';
import { Button, Panel } from '../components/ui';
import { formatWhen, modeLabel, statusIcon } from '../features/results/format';
import { useRunContext } from '../features/run/RunContext';
import { StartRunDialog } from '../features/run/StartRunDialog';

const th = 'px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-t border-grey-100 px-3 py-2 text-sm';

const num = (v: number | undefined, warn?: boolean) =>
    v === undefined ? (
        <span className="text-grey-500">–</span>
    ) : (
        <span className={warn && v > 0 ? 'font-bold text-warn' : ''}>{v}</span>
    );

// Wo steht die Migration? Ein Blick auf den letzten Lauf jedes Objekts.
export function OverviewPage() {
    const objects = useObjects();
    const run = useRunContext();
    const [runFolder, setRunFolder] = useState<string | null>(null);
    const list = objects.data?.objects ?? [];

    if (objects.isPending) return <p className="text-grey-500">Lade …</p>;
    return (
        <Panel label="Übersicht">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className={th}>Objekt</th>
                            <th className={th}>Operation</th>
                            <th className={th}>Letzter Lauf</th>
                            <th className={`${th} text-right`}>Eingefügt</th>
                            <th className={`${th} text-right`}>Aktualisiert</th>
                            <th className={`${th} text-right`}>Fehler</th>
                            <th className={`${th} text-right`}>Fehlende Parents</th>
                            <th className={th} />
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((o) => {
                            const l = o.lastRun;
                            return (
                                <tr key={o.folder}>
                                    <td className={td}>
                                        <Link
                                            className="font-bold text-digital-blue hover:underline"
                                            to={`/konfiguration/${o.folder}`}
                                        >
                                            {o.folder.replace('_', ' · ')}
                                        </Link>
                                    </td>
                                    <td className={`${td} text-grey-500`}>{o.operation}</td>
                                    <td className={td}>
                                        {l ? (
                                            <Link
                                                className={`hover:underline ${l.ok ? 'text-ok' : 'text-bad'}`}
                                                to={
                                                    l.runId
                                                        ? `/laeufe/${o.folder}/${l.runId}`
                                                        : `/laeufe`
                                                }
                                            >
                                                {statusIcon(l)} {formatWhen(l.at)} ·{' '}
                                                {modeLabel(l.mode)}
                                            </Link>
                                        ) : (
                                            <span className="text-grey-500">
                                                noch nicht gelaufen
                                            </span>
                                        )}
                                    </td>
                                    <td className={`${td} text-right`}>
                                        {l ? num(l.inserted) : ''}
                                    </td>
                                    <td className={`${td} text-right`}>
                                        {l ? num(l.updated) : ''}
                                    </td>
                                    <td className={`${td} text-right`}>
                                        {l ? num(l.errors, true) : ''}
                                    </td>
                                    <td className={`${td} text-right`}>
                                        {l ? num(l.missingParents, true) : ''}
                                    </td>
                                    <td className={`${td} text-right`}>
                                        <Button
                                            variant="ghost"
                                            small
                                            disabled={run.running}
                                            onClick={() => setRunFolder(o.folder)}
                                        >
                                            Starten
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <StartRunDialog folder={runFolder} onClose={() => setRunFolder(null)} />
        </Panel>
    );
}
