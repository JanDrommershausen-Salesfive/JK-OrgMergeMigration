import { NavLink } from 'react-router';

const ITEMS = [
    { to: '/', label: 'Übersicht', end: true },
    { to: '/konfiguration', label: 'Konfiguration', end: false },
    { to: '/laeufe', label: 'Läufe', end: false }
];

export function MainNav() {
    return (
        <nav aria-label="Hauptnavigation" className="border-b border-grey-line bg-white">
            <ul className="mx-auto flex max-w-[1600px] list-none gap-1 px-8 max-sm:px-4">
                {ITEMS.map((i) => (
                    <li key={i.to}>
                        <NavLink
                            to={i.to}
                            end={i.end}
                            className={({ isActive }) =>
                                `-mb-px block border-b-2 px-4 py-3 text-sm font-bold ${isActive ? 'border-digital-blue text-digital-blue' : 'border-transparent text-grey-500 hover:text-ink'}`
                            }
                        >
                            {i.label}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
