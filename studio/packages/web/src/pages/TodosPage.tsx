import { TODO_STATUS_LABELS, type TodoStatus } from '@studio/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTodos } from '../api/queries';
import { Panel } from '../components/ui';
import { TodoRow } from '../features/todos/TodoRow';

const select = 'rounded-lg border border-grey-line bg-white px-2 py-1.5 text-sm';
const STATUSES = Object.keys(TODO_STATUS_LABELS) as TodoStatus[];

// Sammelliste der Migrationsfehler: gleiche Fehler zusammengefasst, mit Kategorie und Lösungsvorschlag.
export function TodosPage() {
    const todos = useTodos();
    const [object, setObject] = useState('');
    const [status, setStatus] = useState<'active' | 'all' | TodoStatus>('active');
    const items = todos.data?.items ?? [];
    const objects = [...new Set(items.map((t) => t.object))].sort();
    const shown = items.filter(
        (t) =>
            (!object || t.object === object) &&
            (status === 'all' ||
                (status === 'active'
                    ? t.status === 'open' || t.status === 'doing'
                    : t.status === status))
    );

    return (
        <>
            <p className="mb-2 text-[13px]">
                <Link className="text-digital-blue underline" to="/tools">
                    ← Tools
                </Link>
            </p>
            <h2 className="mb-1 text-xl font-normal tracking-tighter">Migration To-Do</h2>
            <p className="mb-4 text-[13px] text-grey-500">
                Fehler aus den Läufen, nach Ursache zusammengefasst. Eingetragen wird auf der
                Ergebnisseite eines Laufs mit „In To-Do übernehmen“. Die Liste liegt lokal und nicht
                im Git.
            </p>
            <Panel label="To-Do-Liste">
                <div className="flex flex-wrap items-center gap-3 border-b border-grey-line p-4">
                    <select
                        aria-label="Objekt"
                        className={select}
                        value={object}
                        onChange={(e) => setObject(e.target.value)}
                    >
                        <option value="">Alle Objekte</option>
                        {objects.map((o) => (
                            <option key={o}>{o}</option>
                        ))}
                    </select>
                    <select
                        aria-label="Status"
                        className={select}
                        value={status}
                        onChange={(e) => setStatus(e.target.value as typeof status)}
                    >
                        <option value="active">Offen und in Arbeit</option>
                        <option value="all">Alle</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {TODO_STATUS_LABELS[s]}
                            </option>
                        ))}
                    </select>
                    <span className="text-[13px] text-grey-500">{shown.length} Einträge</span>
                </div>
                <div className="p-4">
                    {todos.isPending && <p className="text-grey-500">Lade …</p>}
                    {todos.error && (
                        <p role="alert" className="text-bad">
                            {todos.error.message}
                        </p>
                    )}
                    {todos.data && shown.length === 0 && (
                        <p className="py-6 text-center text-grey-500">
                            {items.length === 0
                                ? 'Noch nichts übernommen. Öffne einen Lauf unter Läufe und wähle „In To-Do übernehmen“.'
                                : 'Keine Einträge für diesen Filter.'}
                        </p>
                    )}
                    <ul className="m-0 grid list-none gap-3 p-0">
                        {shown.map((t) => (
                            <TodoRow key={t.id} t={t} />
                        ))}
                    </ul>
                </div>
            </Panel>
        </>
    );
}
