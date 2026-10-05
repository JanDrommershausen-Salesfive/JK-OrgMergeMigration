import { useState } from 'react';
import { Link } from 'react-router';
import { Drawer } from '../../components/Drawer';
import { useTodos } from '../../api/queries';
import { TodoRow } from './TodoRow';

interface Props {
    object: string;
    open: boolean;
    onClose: () => void;
}

// To-Dos eines Objekts in der Seitenleiste der Konfiguration. Erledigte und verworfene sind ausgeblendet, bis man sie zuschaltet.
export function TodoDrawer({ object, open, onClose }: Props) {
    const todos = useTodos();
    const [all, setAll] = useState(false);
    const mine = (todos.data?.items ?? []).filter((t) => t.object === object);
    const shown = mine.filter((t) => all || t.status === 'open' || t.status === 'doing');

    return (
        <Drawer open={open} wide kicker={object} title="To-Dos" onClose={onClose}>
            <div className="mb-3 flex items-center gap-3 text-[13px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                        type="checkbox"
                        checked={all}
                        onChange={(e) => setAll(e.target.checked)}
                    />{' '}
                    auch erledigte
                </label>
                <span className="flex-1" />
                <Link className="text-digital-blue underline" to="/tools/todos">
                    Alle To-Dos
                </Link>
            </div>
            {todos.isPending && <p className="text-grey-500">Lade …</p>}
            {todos.data && shown.length === 0 && (
                <p className="text-[13px] text-grey-500">
                    {mine.length === 0
                        ? 'Keine To-Dos für dieses Objekt. Fehler eines Laufs übernimmst du auf der Ergebnisseite mit „In To-Do übernehmen“.'
                        : 'Nichts offen.'}
                </p>
            )}
            <ul className="m-0 grid list-none gap-3 p-0">
                {shown.map((t) => (
                    <TodoRow key={t.id} t={t} onNavigate={onClose} />
                ))}
            </ul>
        </Drawer>
    );
}
