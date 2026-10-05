import {
    TODO_CATEGORIES,
    TODO_STATUS_LABELS,
    type TodoItem,
    type TodoStatus
} from '@studio/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDeleteTodo, useUpdateTodo } from '../../api/queries';
import { Button } from '../../components/ui';

const select = 'rounded-lg border border-grey-line bg-white px-2 py-1.5 text-sm';
const STATUSES = Object.keys(TODO_STATUS_LABELS) as TodoStatus[];

const stepLink = (t: TodoItem) =>
    t.step
        ? `/konfiguration/${t.folder}/${t.step}${t.step === 'werte' && t.apiField ? `?feld=${encodeURIComponent(t.apiField)}` : ''}`
        : null;

const STATUS_SHORT: Record<TodoStatus, string> = {
    open: 'Offen',
    doing: 'In Arbeit',
    done: 'Erledigt',
    wontfix: 'Verwerfen'
};

// Status mit einem Klick wechseln: alle Werte sichtbar nebeneinander.
function StatusSwitch({
    value,
    onChange,
    label
}: {
    value: TodoStatus;
    onChange: (s: TodoStatus) => void;
    label: string;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="inline-flex overflow-hidden rounded-full border border-grey-line"
        >
            {STATUSES.map((s) => (
                <button
                    key={s}
                    type="button"
                    aria-pressed={value === s}
                    title={TODO_STATUS_LABELS[s]}
                    onClick={() => value !== s && onChange(s)}
                    className={`cursor-pointer border-l border-grey-line px-3 py-1 text-xs font-bold first:border-l-0 ${value === s ? (s === 'done' ? 'bg-ok-soft text-ok' : 'bg-digital-blue text-white') : 'bg-white text-grey-500 hover:bg-grey-100'}`}
                >
                    {STATUS_SHORT[s]}
                </button>
            ))}
        </div>
    );
}

export function TodoRow({ t, onNavigate }: { t: TodoItem; onNavigate?: () => void }) {
    const update = useUpdateTodo();
    const del = useDeleteTodo();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState(t.note);
    const link = stepLink(t);
    const closed = t.status === 'done' || t.status === 'wontfix';
    const category = TODO_CATEGORIES[t.category];

    return (
        <li className={`rounded-xl border border-grey-line ${closed ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">
                    <b>{t.object}</b>
                    {t.field && <span className="text-grey-500"> · {t.field}</span>}
                    <span className="ml-3 text-xs text-grey-500">{category}</span>
                </span>
                <span className="rounded-full bg-grey-100 px-2 py-px text-xs font-bold">
                    {t.count}×
                </span>
                <StatusSwitch
                    value={t.status}
                    label={`Status ${t.object} ${category}`}
                    onChange={(status) => update.mutate({ id: t.id, status })}
                />
                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? 'Details ausblenden' : 'Details anzeigen'}
                    onClick={() => setOpen(!open)}
                    className="grid size-8 cursor-pointer place-items-center rounded-full border border-grey-line hover:border-ink"
                >
                    <span
                        aria-hidden="true"
                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                    >
                        ⌄
                    </span>
                </button>
            </div>
            {open && (
                <div className="grid gap-3 border-t border-grey-line bg-grey-100/40 px-4 py-3 text-[13px]">
                    <div>
                        <div className="text-xs font-bold text-grey-500">Fehlermeldung</div>
                        <p className="m-0 text-bad">{t.message}</p>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-grey-500">Lösungsvorschlag</div>
                        <p className="m-0">{t.suggestion}</p>
                        {link && (
                            <Link to={link} onClick={onNavigate} className="mt-2 inline-block">
                                <Button variant="ghost" small tabIndex={-1}>
                                    Zur Konfiguration →
                                </Button>
                            </Link>
                        )}
                    </div>
                    <div>
                        <div className="text-xs font-bold text-grey-500">Beispiele</div>
                        <ul className="m-0 list-disc pl-5">
                            {t.examples.map((e) => (
                                <li key={e.id + e.label}>
                                    {e.label}{' '}
                                    <span className="font-mono text-xs text-grey-500">{e.id}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-1 mb-0 text-grey-500">
                            Zuerst gesehen:{' '}
                            <Link
                                className="underline"
                                to={`/laeufe/${t.firstRun.folder}/${t.firstRun.id}`}
                            >
                                {new Date(t.firstRun.at).toLocaleString('de-DE')}
                            </Link>
                            , zuletzt:{' '}
                            <Link
                                className="underline"
                                to={`/laeufe/${t.lastRun.folder}/${t.lastRun.id}`}
                            >
                                {new Date(t.lastRun.at).toLocaleString('de-DE')}
                            </Link>
                        </p>
                    </div>
                    <label className="block text-xs font-bold text-grey-500">
                        Notiz
                        <textarea
                            className={`${select} mt-1 block w-full font-normal`}
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onBlur={() => note !== t.note && update.mutate({ id: t.id, note })}
                        />
                    </label>
                    <div>
                        <Button variant="ghost" small onClick={() => del.mutate(t.id)}>
                            Eintrag löschen
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}
