import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAllRuns } from '../api/queries';
import { Panel } from '../components/ui';
import { hasFindings } from '../features/results/format';
import { RunDetail } from '../features/results/RunDetail';
import { RunList } from '../features/results/RunList';

const select = 'rounded-lg border border-grey-line bg-white px-2 py-1.5 text-sm';

export function RunsPage() {
    const { folder, id } = useParams();
    const all = useAllRuns();
    const [object, setObject] = useState('');
    const [mode, setMode] = useState('');
    const [onlyFindings, setOnlyFindings] = useState(false);

    const runs = useMemo(() => all.data?.runs ?? [], [all.data]);
    const objects = useMemo(() => [...new Set(runs.map((r) => r.folder))].sort(), [runs]);
    const filtered = runs.filter(
        (r) =>
            (!object || r.folder === object) &&
            (!mode || r.mode === mode) &&
            (!onlyFindings || hasFindings(r))
    );

    if (all.isPending) return <p className="text-grey-500">Lade …</p>;
    if (all.error) return <p className="text-bad">{all.error.message}</p>;
    if (!runs.length) {
        return (
            <Panel label="Läufe">
                <p className="p-8 text-center text-grey-500">
                    Noch keine Läufe archiviert. Starte unter „Konfiguration“ oder „Übersicht“ einen
                    Lauf; Ergebnisse erscheinen hier.
                </p>
            </Panel>
        );
    }
    // /laeufe ohne Auswahl zeigt den neuesten Lauf.
    if (!folder || !id) {
        const first = filtered[0] ?? runs[0];
        return first ? <Navigate to={`/laeufe/${first.folder}/${first.id}`} replace /> : null;
    }

    return (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Panel label="Läufe">
                <div className="flex flex-wrap items-center gap-2 border-b border-grey-line p-3">
                    <select
                        className={select}
                        value={object}
                        onChange={(e) => setObject(e.target.value)}
                        aria-label="Objekt filtern"
                    >
                        <option value="">Alle Objekte</option>
                        {objects.map((o) => (
                            <option key={o} value={o}>
                                {o.replace(/^\d+_/, '')}
                            </option>
                        ))}
                    </select>
                    <select
                        className={select}
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        aria-label="Modus filtern"
                    >
                        <option value="">Alle Modi</option>
                        <option value="simulation">Simulation</option>
                        <option value="live">Live</option>
                    </select>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input
                            type="checkbox"
                            checked={onlyFindings}
                            onChange={(e) => setOnlyFindings(e.target.checked)}
                        />{' '}
                        auffällig
                    </label>
                </div>
                <RunList runs={filtered} />
            </Panel>
            <Panel label="Lauf-Details">
                <RunDetail key={`${folder}/${id}`} folder={folder} id={id} />
            </Panel>
        </div>
    );
}
