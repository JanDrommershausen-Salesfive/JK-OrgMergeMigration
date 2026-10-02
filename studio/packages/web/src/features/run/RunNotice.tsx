import { Link } from 'react-router';
import { useObjects } from '../../api/queries';
import { useRunContext } from './RunContext';

// Hinweis nach Laufende mit Link zum Ergebnis; ersetzt das automatische Umschalten.
export function RunNotice() {
    const run = useRunContext();
    const objects = useObjects();
    const folder = run.running ? run.runningFolder : run.finished;
    if (!folder) return null;

    if (run.running) {
        return (
            <div
                role="status"
                className="mb-4 rounded-xl border border-digital-blue bg-white px-4 py-2 text-sm"
            >
                Lauf läuft: <b>{folder}</b> (Details im Terminal unten)
            </div>
        );
    }
    const last = objects.data?.objects.find((o) => o.folder === folder)?.lastRun;
    return (
        <div
            role="status"
            className={`mb-4 flex items-center gap-3 rounded-xl border bg-white px-4 py-2 text-sm ${last?.ok === false ? 'border-bad' : 'border-ok'}`}
        >
            <span className="flex-1">
                Lauf beendet: <b>{folder}</b>{' '}
                {last?.ok === false ? '✕ fehlgeschlagen oder abgebrochen' : '✓'}
            </span>
            {last?.runId && (
                <Link
                    className="font-bold text-digital-blue underline"
                    to={`/laeufe/${folder}/${last.runId}`}
                >
                    Ergebnis ansehen
                </Link>
            )}
            <button
                type="button"
                className="cursor-pointer text-grey-500 hover:text-ink"
                onClick={run.dismissFinished}
                aria-label="Hinweis schließen"
            >
                ×
            </button>
        </div>
    );
}
