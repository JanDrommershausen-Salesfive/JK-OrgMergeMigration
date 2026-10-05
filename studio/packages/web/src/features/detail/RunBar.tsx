import type { LastRun } from '@studio/shared';
import { Link } from 'react-router';
import { Button } from '../../components/ui';
import { formatWhen, lastRunFindings, modeLabel } from '../results/format';

interface Props {
    folder: string;
    object: string;
    last: LastRun | null;
    running: boolean;
    onStart: () => void;
}

// Feste Leiste am unteren Rand: Stand des letzten Laufs und der Start des nächsten.
export function RunBar({ folder, object, last, running, onStart }: Props) {
    return (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-4 rounded-b-xl border-t border-grey-line bg-white px-6 py-3">
            <p className="m-0 min-w-0 flex-1 text-[13px] text-grey-500">
                {last ? (
                    <>
                        Letzter Lauf: {last.ok ? '✓' : '✕'} {modeLabel(last.mode)},{' '}
                        {formatWhen(last.at)}
                        {lastRunFindings(last) && ` · ${lastRunFindings(last)}`}
                        {last.runId && (
                            <>
                                {' · '}
                                <Link
                                    className="font-bold text-digital-blue underline"
                                    to={`/laeufe/${folder}/${last.runId}`}
                                >
                                    Ergebnis
                                </Link>
                            </>
                        )}
                    </>
                ) : (
                    'Noch kein Lauf für dieses Objekt.'
                )}
            </p>
            <Button disabled={running} onClick={onStart}>
                {object}-Lauf starten
            </Button>
        </div>
    );
}
