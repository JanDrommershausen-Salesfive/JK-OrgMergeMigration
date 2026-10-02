import type { OrgsResponse, RunMode } from '@studio/shared';
import { useState } from 'react';
import { useCohorts, useObjects, useOrgs } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { useRunContext } from './RunContext';

const orgOk = (o: OrgsResponse['source']) => o.connected && o.idMatches;

function blocker(running: boolean, orgs: OrgsResponse | undefined): string {
    if (running) return 'Es läuft bereits ein Lauf.';
    if (!orgs) return 'Verbindung wird geprüft …';
    if (!orgOk(orgs.source) || !orgOk(orgs.target)) return 'Quelle und Ziel müssen verbunden sein.';
    return '';
}

interface Props {
    folder: string | null; // null: Dialog geschlossen
    onClose: () => void;
}

// Modus bewusst wählen: Live schreibt ins Ziel und braucht eine eigene Bestätigung.
export function StartRunDialog({ folder, onClose }: Props) {
    const run = useRunContext();
    const objects = useObjects();
    const orgs = useOrgs(true);
    const cohorts = useCohorts();
    const [mode, setMode] = useState<RunMode>('simulation');
    const [cohortId, setCohortId] = useState('');
    const [keepFilters, setKeepFilters] = useState(false);
    const live = mode === 'live';
    const target = objects.data?.targetAlias ?? '';
    const problem = blocker(run.running, orgs.data);

    const card = (m: RunMode, title: string, text: string) => (
        <label
            className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${mode === m ? (m === 'live' ? 'border-bad bg-bad-soft' : 'border-digital-blue bg-grey-100') : 'border-grey-line'}`}
        >
            <input
                type="radio"
                name="mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="mt-1"
            />
            <span>
                <span className="block font-bold">{title}</span>
                <span className="block text-[13px] text-grey-500">{text}</span>
            </span>
        </label>
    );

    return (
        <Dialog open={folder !== null} title={`Lauf starten: ${folder ?? ''}`} onClose={onClose}>
            <div className="grid gap-3 md:grid-cols-2">
                {card(
                    'simulation',
                    'Simulation',
                    'Liest nur und schreibt nichts ins Ziel. Zeigt, was geschrieben würde.'
                )}
                {card(
                    'live',
                    'Live',
                    `Schreibt Datensätze nach ${target}. Nicht rückgängig zu machen.`
                )}
            </div>
            <label className="mt-4 block text-sm">
                <span className="mb-1 block font-bold">Umfang</span>
                <select
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                    className="w-full rounded-lg border border-grey-line bg-white px-2 py-2 text-sm"
                >
                    <option value="">Alle Datensätze laut Konfiguration</option>
                    {(cohorts.data?.cohorts ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                            Kohorte: {c.name} ({c.count} {c.rootObject})
                        </option>
                    ))}
                </select>
                {cohortId && (
                    <span className="mt-1 block text-[13px] text-grey-500">
                        Nur Datensätze, die zur Kohorte gehören. Objekte ohne Bezug zur Kohorte
                        starten nicht.
                    </span>
                )}
            </label>
            {cohortId && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                        type="checkbox"
                        checked={keepFilters}
                        onChange={(e) => setKeepFilters(e.target.checked)}
                    />
                    Eigene Filter der Objekte zusätzlich anwenden (zum Beispiel Zeitfilter)
                </label>
            )}
            {problem && (
                <p role="status" className="mt-3 text-[13px] text-bad">
                    {problem}
                </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>
                    Abbrechen
                </Button>
                <Button
                    variant={live ? 'danger' : 'primary'}
                    disabled={!!problem || !folder}
                    onClick={() => {
                        if (folder)
                            void run.start(folder, mode, cohortId || undefined, keepFilters);
                        setMode('simulation');
                        onClose();
                    }}
                >
                    {live ? `Live nach ${target} starten` : 'Simulation starten'}
                </Button>
            </div>
        </Dialog>
    );
}
