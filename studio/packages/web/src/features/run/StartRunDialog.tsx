import type { OrgsResponse, RunMode } from '@studio/shared';
import { useState } from 'react';
import { useObjects, useOrgs } from '../../api/queries';
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
    const [mode, setMode] = useState<RunMode>('simulation');
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
                        if (folder) void run.start(folder, mode);
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
