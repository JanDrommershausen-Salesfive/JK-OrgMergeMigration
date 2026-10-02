import type { LastRun, ObjectSummary } from '@studio/shared';

const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

function LastRunBadge({ run }: { run: LastRun | null }) {
    if (!run) return null;
    const title = `Letzter Lauf: ${run.mode === 'live' ? 'Live' : 'Simulation'}, ${new Date(run.at).toLocaleString('de-DE')}${run.ok ? '' : ', fehlgeschlagen oder abgebrochen'}`;
    return (
        <span
            className={`flex-none text-xs ${run.ok ? 'text-ok' : 'text-bad'} group-aria-[current=true]:text-white`}
            title={title}
        >
            {run.ok ? '✓' : '✕'} {time(run.at)}
            {run.mode === 'live' ? ' L' : ''}
        </span>
    );
}

interface Props {
    objects: ObjectSummary[];
    selected: string | null;
    disabled: boolean;
    onSelect: (folder: string) => void;
}

export function ObjectList({ objects, selected, disabled, onSelect }: Props) {
    return (
        <ul className="m-0 max-h-[640px] list-none overflow-auto p-2 max-lg:max-h-52">
            {objects.map((o) => {
                const [num, ...rest] = o.folder.split('_');
                return (
                    <li key={o.folder}>
                        <button
                            type="button"
                            disabled={disabled}
                            aria-current={o.folder === selected}
                            onClick={() => onSelect(o.folder)}
                            className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-grey-100 aria-[current=true]:bg-deep aria-[current=true]:text-white disabled:cursor-not-allowed"
                        >
                            <span className="w-6 flex-none text-xs text-grey-500 group-aria-[current=true]:text-open-blue">
                                {num}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                                {rest.join('_')}
                            </span>
                            <LastRunBadge run={o.lastRun} />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
