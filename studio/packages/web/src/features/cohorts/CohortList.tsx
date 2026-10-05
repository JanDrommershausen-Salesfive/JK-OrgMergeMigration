import type { Cohort } from '@studio/shared';
import { NavLink, useParams } from 'react-router';
import { ruleText } from './cohortText';

function Item({ c, inSeries }: { c: Cohort; inSeries: boolean }) {
    return (
        <li>
            <NavLink
                to={`/kohorten/${c.id}`}
                className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 ${isActive ? 'bg-deep text-white' : 'hover:bg-grey-100'}`
                }
            >
                <span className="block truncate text-sm font-bold">{c.name}</span>
                <span className="block truncate text-xs opacity-70">
                    {c.count} {c.rootObject} · {ruleText(c)}
                </span>
                {!inSeries && (
                    <span className="block truncate text-xs opacity-70">
                        angelegt {new Date(c.createdAt).toLocaleDateString('de-DE')}
                    </span>
                )}
            </NavLink>
        </li>
    );
}

// Einzelne Kohorten und Serien. Eine Serie ist eingeklappt (sie hat leicht Dutzende Blöcke) und klappt auf,
// sobald einer ihrer Blöcke gewählt ist.
export function CohortList({ cohorts }: { cohorts: Cohort[] }) {
    const { id } = useParams();
    const bySeries = new Map<string, Cohort[]>();
    const entries: ({ single: Cohort } | { seriesId: string })[] = [];
    for (const c of cohorts) {
        if (!c.series) {
            entries.push({ single: c });
        } else if (!bySeries.has(c.series.id)) {
            bySeries.set(c.series.id, [c]);
            entries.push({ seriesId: c.series.id });
        } else bySeries.get(c.series.id)!.push(c);
    }

    return (
        <ul className="m-0 max-h-[70vh] list-none overflow-auto p-2">
            {entries.map((e) => {
                if ('single' in e) return <Item key={e.single.id} c={e.single} inSeries={false} />;
                const blocks = (bySeries.get(e.seriesId) ?? []).sort(
                    (a, b) => a.series!.index - b.series!.index
                );
                const first = blocks[0]!;
                const total = blocks.reduce((sum, b) => sum + b.count, 0);
                return (
                    <li key={e.seriesId}>
                        <details open={blocks.some((b) => b.id === id)} className="rounded-lg">
                            <summary className="cursor-pointer rounded-lg px-3 py-2 hover:bg-grey-100">
                                <span className="text-sm font-bold">{first.series!.name}</span>
                                <span className="block text-xs text-grey-500">
                                    Serie · {blocks.length} Kohorten ·{' '}
                                    {total.toLocaleString('de-DE')} {first.rootObject}
                                </span>
                            </summary>
                            <ul className="m-0 list-none pl-3">
                                {blocks.map((b) => (
                                    <Item key={b.id} c={b} inSeries />
                                ))}
                            </ul>
                        </details>
                    </li>
                );
            })}
        </ul>
    );
}
