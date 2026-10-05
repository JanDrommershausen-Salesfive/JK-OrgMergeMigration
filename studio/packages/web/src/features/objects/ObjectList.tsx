import type { ObjectSummary } from '@studio/shared';
import { NavLink } from 'react-router';
import { formatWhen, lastRunFindings, statusIcon } from '../results/format';

// Objektliste der Konfiguration. Der Status des letzten Laufs steht unter dem Namen,
// damit lange Texte den Namen nicht verdrängen.
export function ObjectList({ objects }: { objects: ObjectSummary[] }) {
    return (
        <ul className="m-0 max-h-[70vh] list-none overflow-auto p-2 max-lg:max-h-52">
            {objects.map((o) => {
                const [num, ...rest] = o.folder.split('_');
                const run = o.lastRun;
                const findings = run ? lastRunFindings(run) : '';
                return (
                    <li key={o.folder}>
                        <NavLink
                            to={`/konfiguration/${o.folder}`}
                            className={({ isActive }) =>
                                `group flex items-start gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-deep text-white' : 'hover:bg-grey-100'}`
                            }
                        >
                            <span className="w-6 flex-none pt-0.5 text-xs text-grey-500 group-aria-[current=page]:text-open-blue">
                                {num}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{rest.join('_')}</span>
                                <span className="block truncate text-xs text-grey-500 group-aria-[current=page]:text-white/80">
                                    {o.fieldCount} Felder
                                    {o.valueMappingCount
                                        ? ` · ${o.valueMappingCount} Wertemappings`
                                        : ''}
                                </span>
                                {run && (
                                    <span
                                        className={`block truncate text-xs ${run.ok ? 'text-ok' : 'text-bad'} group-aria-[current=page]:text-white/80`}
                                        title={`Letzter Lauf: ${run.mode === 'live' ? 'Live' : 'Simulation'}, ${new Date(run.at).toLocaleString('de-DE')}`}
                                    >
                                        {statusIcon(run)} {formatWhen(run.at)}
                                        {run.mode === 'live' ? ' · Live' : ''}
                                        {findings && ` · ${findings}`}
                                    </span>
                                )}
                            </span>
                        </NavLink>
                    </li>
                );
            })}
        </ul>
    );
}
