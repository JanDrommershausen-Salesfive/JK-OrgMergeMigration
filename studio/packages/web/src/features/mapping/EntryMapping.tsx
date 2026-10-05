import { useDescribe, useDescribeObject, useObject } from '../../api/queries';
import type { Report } from '../detail/saveMessage';
import { FieldsTab } from '../fields/FieldsTab';
import { UncoveredTargetFields } from '../fields/UncoveredTargetFields';

interface Props {
    folder: string;
    parentIndex?: number; // gesetzt: mitgezogener Parent-Eintrag statt Zielobjekt
    onlyDiff: boolean;
    running: boolean;
    report: Report;
    onOpenValueMapping?: (field: string) => void;
}

// Mapping eines Eintrags: Feldtabelle (Quelle → Ziel) und darunter die Zielfelder ohne Quelle.
export function EntryMapping({
    folder,
    parentIndex,
    onlyDiff,
    running,
    report,
    onOpenValueMapping
}: Props) {
    const detail = useObject(folder, parentIndex);
    const objectDescribe = useDescribe(parentIndex === undefined ? folder : null);
    const parentDescribe = useDescribeObject(
        parentIndex === undefined ? null : (detail.data?.object ?? null)
    );
    const describe = parentIndex === undefined ? objectDescribe : parentDescribe;

    if (detail.error)
        return (
            <p role="alert" className="text-bad">
                {detail.error.message}
            </p>
        );
    if (!detail.data) return <p className="text-grey-500">Lade …</p>;
    const d = describe.data;

    return (
        <>
            <FieldsTab
                detail={detail.data}
                describe={d}
                describeError={describe.error?.message ?? null}
                onlyDiff={onlyDiff}
                running={running}
                report={report}
                onOpenValueMapping={onOpenValueMapping}
            />
            {d?.target.ok && (
                <UncoveredTargetFields fields={detail.data.fields} target={d.target.fields} />
            )}
        </>
    );
}
