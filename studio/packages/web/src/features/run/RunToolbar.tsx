import type { OrgsResponse, RunMode } from '@studio/shared';
import { Button } from '../../components/ui';

interface Props {
    mode: RunMode;
    onModeChange: (mode: RunMode) => void;
    targetAlias: string;
    selected: string | null;
    orgs: OrgsResponse | undefined;
    running: boolean;
    onStart: () => void;
    onStop: () => void;
}

const orgOk = (o: OrgsResponse['source']) => o.connected && o.idMatches;

export function RunToolbar({
    mode,
    onModeChange,
    targetAlias,
    selected,
    orgs,
    running,
    onStart,
    onStop
}: Props) {
    const live = mode === 'live';
    const blocker = running
        ? ''
        : !selected
          ? 'Bitte ein Objekt wählen.'
          : !orgs
            ? 'Verbindung wird geprüft …'
            : !orgOk(orgs.source) || !orgOk(orgs.target)
              ? 'Quelle und Ziel müssen verbunden sein.'
              : '';
    const seg =
        'cursor-pointer rounded-full px-4.5 py-1.5 text-sm font-bold text-grey-500 aria-pressed:bg-white aria-pressed:text-deep aria-pressed:shadow-sm';

    return (
        <div
            className={`mx-6 mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${live ? 'border-bad bg-bad-soft' : 'border-grey-line bg-off-white'}`}
        >
            <div
                role="group"
                aria-label="Modus"
                className={`inline-grid grid-cols-2 rounded-full p-[3px] ${live ? 'bg-bad/10' : 'bg-grey-100'}`}
            >
                <button
                    type="button"
                    className={seg}
                    aria-pressed={!live}
                    onClick={() => onModeChange('simulation')}
                >
                    Simulation
                </button>
                <button
                    type="button"
                    className={`${seg} aria-pressed:bg-bad aria-pressed:text-white`}
                    aria-pressed={live}
                    onClick={() => onModeChange('live')}
                >
                    Live
                </button>
            </div>
            <span
                className={`min-w-44 flex-1 text-[13px] ${live ? 'font-bold text-bad' : 'text-grey-500'}`}
            >
                {live
                    ? `Live schreibt Datensätze nach ${targetAlias}.`
                    : 'Simulation liest nur und schreibt nichts ins Ziel.'}
            </span>
            <Button
                variant={live ? 'danger' : 'primary'}
                disabled={running || !!blocker}
                onClick={onStart}
            >
                {live ? 'Live starten' : 'Simulation starten'}
            </Button>
            <Button variant="ghost" disabled={!running} onClick={onStop}>
                Abbrechen
            </Button>
            {blocker && (
                <p role="status" className="m-0 w-full text-[13px] text-bad">
                    {blocker}
                </p>
            )}
        </div>
    );
}
