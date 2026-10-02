import type { QueryCheck } from '@studio/shared';
import { useState } from 'react';
import { useDescribe, useQueryModel } from '../../api/queries';
import { useCheckQuery } from '../../api/queries';
import type { Report } from '../detail/saveMessage';
import { CheckPanel } from './CheckPanel';
import { FieldsSection } from './FieldsSection';
import { FilterEditor } from './FilterEditor';
import { ParentsSection } from './ParentsSection';
import { SoqlPreview } from './SoqlPreview';

export function QueryTab({
    folder,
    running,
    report
}: {
    folder: string;
    running: boolean;
    report: Report;
}) {
    const model = useQueryModel(folder);
    const describe = useDescribe(folder);
    const check = useCheckQuery();
    const [result, setResult] = useState<QueryCheck | null>(null);

    if (model.error)
        return (
            <p role="alert" className="text-bad">
                {model.error.message}
            </p>
        );
    const m = model.data;
    if (!m) return <p className="text-grey-500">Lade …</p>;

    const sourceFields = describe.data?.source.ok ? describe.data.source.fields : null;
    return (
        <div className="space-y-6">
            {!m.supported && (
                <p
                    role="status"
                    className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn"
                >
                    Diese Query enthält Unterabfragen oder Funktionen und kann hier nur angesehen
                    werden. Änderungen gehen über die export.json.
                </p>
            )}
            <SoqlPreview soql={m.soql} />
            {m.supported && (
                <>
                    <FieldsSection model={m} running={running} report={report} />
                    {/* key: nach dem Speichern (neue Query) beginnt der Editor wieder mit dem gespeicherten Stand */}
                    <FilterEditor
                        key={m.soql}
                        model={m}
                        sourceFields={sourceFields}
                        running={running}
                        report={report}
                    />
                </>
            )}
            <ParentsSection
                model={m}
                checks={result?.parents ?? null}
                running={running}
                report={report}
            />
            <CheckPanel
                result={result}
                pending={check.isPending}
                error={check.error?.message ?? null}
                disabled={running}
                onCheck={() => check.mutate(folder, { onSuccess: setResult })}
            />
        </div>
    );
}
