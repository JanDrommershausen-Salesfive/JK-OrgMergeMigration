import type { ParentCheck, ParentEntry, QueryModel } from '@studio/shared';
import { useState } from 'react';
import { useSetParentMode } from '../../api/queries';
import { Button, Tag } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { ParentFieldsDialog } from './ParentFieldsDialog';

interface Props {
    model: QueryModel;
    checks: ParentCheck[] | null; // Ergebnis von "Prüfen", falls vorhanden
    running: boolean;
    report: Report;
}

function Stats({ check }: { check: ParentCheck | undefined }) {
    if (!check) return null;
    if (check.note && check.missing === null)
        return <p className="text-[13px] text-grey-500">{check.note}</p>;
    return (
        <p className="text-[13px]">
            <b>{check.referenced}</b> referenziert · <b>{check.existingInTarget}</b> schon im Ziel ·{' '}
            <b className={check.missing ? 'text-warn' : 'text-ok'}>{check.missing}</b> fehlen im
            Ziel
            {check.note && <span className="text-grey-500"> ({check.note})</span>}
        </p>
    );
}

interface CardProps {
    parent: ParentEntry;
    model: QueryModel;
    check: ParentCheck | undefined;
    running: boolean;
    report: Report;
    onPickFields: (p: ParentEntry) => void;
}

function ParentCard({ parent, model, check, running, report, onPickFields }: CardProps) {
    const mutate = useSetParentMode(model.folder);
    const [confirmPull, setConfirmPull] = useState(false);
    const apply = (mode: 'read' | 'pull') => {
        report('Speichere …');
        mutate.mutate(
            { folder: model.folder, index: parent.index, mode },
            {
                onSuccess: () => {
                    setConfirmPull(false);
                    report(
                        `✓ ${parent.object}: ${mode === 'pull' ? 'Mitziehen' : 'Nur lesen'} gespeichert`
                    );
                },
                onError: (e) => report(e.message, true)
            }
        );
    };
    const missing = check?.missing ?? null;
    const seg =
        'cursor-pointer px-4 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50';
    const on = 'bg-deep text-white';

    return (
        <div className="mb-2 rounded-xl border border-grey-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-32 text-base font-bold">{parent.object}</span>
                <div
                    role="group"
                    aria-label={`Modus für ${parent.object}`}
                    className="inline-flex overflow-hidden rounded-full border border-grey-line"
                >
                    <button
                        type="button"
                        aria-pressed={parent.mode === 'read'}
                        disabled={running || mutate.isPending}
                        className={`${seg} ${parent.mode === 'read' ? on : ''}`}
                        onClick={() => parent.mode !== 'read' && apply('read')}
                    >
                        Nur lesen
                    </button>
                    <button
                        type="button"
                        aria-pressed={parent.mode === 'pull' || confirmPull}
                        disabled={running || mutate.isPending || !parent.configFolder}
                        title={
                            parent.configFolder
                                ? undefined
                                : `Keine eigene Konfiguration für ${parent.object}`
                        }
                        className={`${seg} ${parent.mode === 'pull' || confirmPull ? on : ''}`}
                        onClick={() => parent.mode !== 'pull' && setConfirmPull(true)}
                    >
                        Mitziehen
                    </button>
                </div>
                {parent.mode === 'custom' && <Tag>Manuell geschrieben</Tag>}
                {parent.mode === 'pull' && (
                    <Button
                        variant="ghost"
                        small
                        disabled={running}
                        onClick={() => onPickFields(parent)}
                    >
                        Felder wählen ({parent.fields.length})
                    </Button>
                )}
                <span className="flex-1" />
                <Stats check={check} />
            </div>
            {confirmPull && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-3 py-2">
                    <span className="text-[13px] text-bad">
                        Der Lauf legt {parent.object}-Datensätze im Ziel an
                        {missing ? ` (hier ${missing}, das belegt Speicher in der Sandbox)` : ''}.
                    </span>
                    <Button
                        small
                        variant="danger"
                        disabled={mutate.isPending}
                        onClick={() => apply('pull')}
                    >
                        Ja, mitziehen
                    </Button>
                    <Button small variant="ghost" onClick={() => setConfirmPull(false)}>
                        Abbrechen
                    </Button>
                </div>
            )}
            {parent.mode === 'custom' && (
                <p className="mt-1 text-[13px] text-grey-500">
                    Der Eintrag wurde von Hand geschrieben
                    {parent.where ? ` (Filter: ${parent.where})` : ''}. Ein eigener Filter kann
                    Parents ausblenden, auf die die Datensätze zeigen. Mit einer Auswahl wird er
                    vereinheitlicht.
                </p>
            )}
        </div>
    );
}

// Parents: nur lesen (müssen im Ziel schon da sein) oder im selben Lauf mitziehen. Pro Parent eine kompakte Zeile.
export function ParentsSection({ model, checks, running, report }: Props) {
    const [fieldsFor, setFieldsFor] = useState<ParentEntry | null>(null);
    // Der Dialog zeigt immer den aktuellen Stand des Parents (nach dem Speichern ändert sich die Feldliste).
    const current = fieldsFor
        ? (model.parents.find((p) => p.index === fieldsFor.index) ?? null)
        : null;

    return (
        <section>
            <h3 className="mb-1 text-sm font-bold">Parents</h3>
            {model.parents.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-[13px] text-grey-500">
                    <li>
                        <b>Nur lesen:</b> Der Lauf schreibt nur {model.object}. Der Parent muss im
                        Ziel schon existieren, sonst entstehen fehlende Parents.
                    </li>
                    <li>
                        <b>Mitziehen:</b> Fehlende Parents werden im selben Lauf im Ziel angelegt
                        und belegen dort Speicher. Welche Felder sie bekommen, wählst du pro Parent.
                    </li>
                </ul>
            )}
            {!model.parents.length ? (
                <p className="text-[13px] text-grey-500">
                    Dieses Objekt hat keine Parent-Einträge.
                </p>
            ) : (
                model.parents.map((p) => (
                    <ParentCard
                        key={`${p.index}-${p.object}`}
                        parent={p}
                        model={model}
                        check={checks?.find((c) => c.object === p.object)}
                        running={running}
                        report={report}
                        onPickFields={setFieldsFor}
                    />
                ))
            )}
            <ParentFieldsDialog
                model={model}
                parent={current}
                running={running}
                report={report}
                onClose={() => setFieldsFor(null)}
            />
        </section>
    );
}
