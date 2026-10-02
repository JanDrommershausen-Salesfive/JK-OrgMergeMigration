import type { RunMeta } from '@studio/shared';
import { NavLink } from 'react-router';
import { Tag } from '../../components/ui';
import { formatWhen, modeLabel, statusIcon } from './format';

// Läufe aller Objekte; der gewählte Lauf ist durch die URL markiert.
export function RunList({ runs }: { runs: RunMeta[] }) {
    if (!runs.length)
        return <p className="p-4 text-sm text-grey-500">Keine Läufe für diesen Filter.</p>;
    return (
        <ul className="m-0 max-h-[70vh] list-none overflow-auto p-2 max-lg:max-h-72">
            {runs.map((r) => (
                <li key={`${r.folder}/${r.id}`}>
                    <NavLink
                        to={`/laeufe/${r.folder}/${r.id}`}
                        className={({ isActive }) =>
                            `block rounded-lg px-3 py-2 ${isActive ? 'bg-deep text-white' : 'hover:bg-grey-100'}`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <span
                                        className={
                                            r.ok
                                                ? isActive
                                                    ? 'text-[#3ddc84]'
                                                    : 'text-ok'
                                                : isActive
                                                  ? 'text-[#ff9a94]'
                                                  : 'text-bad'
                                        }
                                    >
                                        {statusIcon(r)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-bold">
                                        {r.object}
                                    </span>
                                    {r.mode === 'live' ? (
                                        <Tag tone="bad">Live</Tag>
                                    ) : (
                                        <span
                                            className={`text-xs ${isActive ? 'text-white/70' : 'text-grey-500'}`}
                                        >
                                            {modeLabel(r.mode)}
                                        </span>
                                    )}
                                </div>
                                <div
                                    className={`mt-0.5 text-xs ${isActive ? 'text-white/80' : 'text-grey-500'}`}
                                >
                                    {formatWhen(r.startedAt)} · {r.counts.inserted} neu ·{' '}
                                    {r.counts.updated} akt.
                                    {r.counts.errors > 0 && ` · ${r.counts.errors} Fehler`}
                                    {r.counts.missingParents > 0 &&
                                        ` · ${r.counts.missingParents} ohne Parent`}
                                </div>
                            </>
                        )}
                    </NavLink>
                </li>
            ))}
        </ul>
    );
}
