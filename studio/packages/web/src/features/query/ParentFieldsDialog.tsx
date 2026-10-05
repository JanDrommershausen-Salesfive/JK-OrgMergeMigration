import type { ParentEntry, QueryModel } from '@studio/shared';
import { useChangeFields, useDescribeObject } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { FieldChecklist } from './FieldChecklist';

interface Props {
    model: QueryModel;
    parent: ParentEntry | null; // null: Dialog geschlossen
    running: boolean;
    report: Report;
    onClose: () => void;
}

// Felder, die ein mitgezogener Parent im Ziel mitbekommt, zum Beispiel weil das Ziel sie als Pflichtfeld
// oder für eine Validierungsregel braucht. Pflichtfelder sind markiert.
export function ParentFieldsDialog({ model, parent, running, report, onClose }: Props) {
    const describe = useDescribeObject(parent?.object ?? null);
    const change = useChangeFields(model.folder);
    const d = describe.data;
    const locked: Record<string, string> = { Id: 'wird immer gelesen' };
    for (const f of (parent?.externalId ?? '').split(';').filter(Boolean))
        locked[f] = 'External ID, zum Abgleich nötig';

    return (
        <Dialog
            open={parent !== null}
            title={`Felder für ${parent?.object ?? ''}`}
            onClose={onClose}
        >
            <p className="mb-3 text-[13px] text-grey-500">
                Diese Felder liest die Quelle für {parent?.object}, wenn es im Lauf mitgezogen wird.
                Welche Zielfelder dafür nötig sind (Pflichtfelder, Validierungsregeln), siehst du
                danach im Mapping unter „{parent?.object} (mitgezogen)“. Die Auswahl gilt nur für{' '}
                {model.object}, nicht für die eigene Konfiguration von{' '}
                {parent?.configFolder ?? parent?.object}.
            </p>
            {describe.isPending && <p className="text-grey-500">Lade Felder …</p>}
            {describe.error && (
                <p role="alert" className="text-bad">
                    {describe.error.message}
                </p>
            )}
            {d && !d.source.ok && (
                <p role="alert" className="text-bad">
                    Quelle: {d.source.error}
                </p>
            )}
            {parent && d?.source.ok && (
                <FieldChecklist
                    fields={d.source.fields}
                    selected={parent.fields}
                    locked={locked}
                    disabled={running || change.isPending}
                    onChange={(add, remove) => {
                        report('Speichere …');
                        change.mutate(
                            { folder: model.folder, parentIndex: parent.index, add, remove },
                            {
                                onSuccess: () =>
                                    report(`✓ Felder für ${parent.object} gespeichert`),
                                onError: (e) => report(e.message, true)
                            }
                        );
                    }}
                />
            )}
            <div className="mt-5 flex justify-end">
                <Button onClick={onClose}>Fertig</Button>
            </div>
        </Dialog>
    );
}
