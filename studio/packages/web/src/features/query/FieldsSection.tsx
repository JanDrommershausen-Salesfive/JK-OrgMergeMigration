import type { QueryModel } from '@studio/shared';
import { useChangeFields, useDescribe, useObject } from '../../api/queries';
import type { Report } from '../detail/saveMessage';
import { FieldChecklist } from './FieldChecklist';

// Schritt 1: Welche Felder liest die Quelle? Die Liste zeigt nur Felder, die die Quelle liefern kann.
export function FieldsSection({
    model,
    running,
    report
}: {
    model: QueryModel;
    running: boolean;
    report: Report;
}) {
    const describe = useDescribe(model.folder);
    const detail = useObject(model.folder);
    const change = useChangeFields(model.folder);
    const d = describe.data;

    const locked: Record<string, string> = { Id: 'wird immer gelesen' };
    for (const f of detail.data?.fields ?? []) {
        if (f.externalId) locked[f.name] = 'External ID, zum Abgleich nötig';
    }

    return (
        <section>
            <h3 className="mb-2 text-sm font-bold">Felder</h3>
            {describe.error ? (
                <p role="alert" className="text-[13px] text-bad">
                    {describe.error.message}
                </p>
            ) : !d ? (
                <p className="text-[13px] text-grey-500">Felder werden aus der Quelle geladen …</p>
            ) : !d.source.ok ? (
                <p role="alert" className="text-[13px] text-bad">
                    Quelle: {d.source.error}
                </p>
            ) : (
                <FieldChecklist
                    fields={d.source.fields}
                    selected={model.fields}
                    locked={locked}
                    disabled={running || change.isPending}
                    onChange={(add, remove) => {
                        report('Speichere …');
                        change.mutate(
                            { folder: model.folder, add, remove },
                            {
                                onSuccess: () =>
                                    report(
                                        `✓ Query gespeichert (${add.length ? `+${add.length}` : ''}${add.length && remove.length ? ' ' : ''}${remove.length ? `−${remove.length}` : ''})`
                                    ),
                                onError: (e) => report(e.message, true)
                            }
                        );
                    }}
                />
            )}
        </section>
    );
}
