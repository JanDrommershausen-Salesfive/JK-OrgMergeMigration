import { NavLink } from 'react-router';

export type ConfigStep = 'uebersicht' | 'query' | 'mapping' | 'werte';

export const STEPS: { key: ConfigStep; label: string }[] = [
    { key: 'uebersicht', label: 'Übersicht' },
    { key: 'query', label: 'Query' },
    { key: 'mapping', label: 'Mapping' },
    { key: 'werte', label: 'Wertemapping' }
];

// Schrittband der Objektkonfiguration: Übersicht → 1 Query → 2 Mapping → 3 Wertemapping.
// Schritte vor dem aktuellen gelten als durchlaufen (✓); jeder Schritt ist direkt anwählbar.
export function ConfigFlow({ folder, current }: { folder: string; current: ConfigStep }) {
    const at = STEPS.findIndex((s) => s.key === current);
    return (
        <nav aria-label="Konfigurationsschritte" className="flex items-center px-6 pt-3">
            {STEPS.map((s, i) => {
                const done = i < at;
                const active = i === at;
                return (
                    <div
                        key={s.key}
                        className="flex items-center"
                        style={{ flex: i === STEPS.length - 1 ? '0 0 auto' : '1 1 auto' }}
                    >
                        <NavLink
                            to={`/konfiguration/${folder}/${s.key}`}
                            className={`flex items-center gap-2 py-2.5 text-sm font-bold ${active ? 'text-digital-blue' : done ? 'text-ink' : 'text-grey-500 hover:text-ink'}`}
                        >
                            <span
                                aria-hidden="true"
                                className={`grid size-6 place-items-center rounded-full border text-xs ${active ? 'border-digital-blue bg-digital-blue text-white' : done ? 'border-ok/40 bg-ok-soft text-ok' : 'border-grey-line bg-white'}`}
                            >
                                {done ? '✓' : i === 0 ? '⌂' : i}
                            </span>
                            {s.label}
                        </NavLink>
                        {i < STEPS.length - 1 && (
                            <div
                                aria-hidden="true"
                                className="mx-3 h-px min-w-6 flex-1 bg-grey-line"
                            />
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
