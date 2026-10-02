import type { DescribedField, FieldInfo } from '@studio/shared';

interface Props {
    field: FieldInfo;
    targetFields: Record<string, DescribedField> | null; // null: Ziel nicht lesbar oder noch nicht geladen
    running: boolean;
    onMap: (sourceField: string, targetField: string) => void;
    onExclude: (field: string, excluded: boolean) => void;
}

// × nimmt ein Feld aus dem Mapping: erst eine Umbenennung (zurück auf 1:1), sonst das Feld aus der Migration.
function RemoveButton({ field: f, running, onMap, onExclude }: Omit<Props, 'targetFields'>) {
    if (running || f.externalId || f.name === 'Id') return null;
    const base =
        'size-6 flex-none cursor-pointer rounded-full border text-base leading-[22px] text-center';
    if (f.excluded) {
        return (
            <button
                type="button"
                className={`${base} border-digital-blue text-digital-blue hover:border-bad hover:bg-bad-soft hover:text-bad`}
                title="Feld wieder in die Migration aufnehmen"
                aria-label={`${f.name} wieder aufnehmen`}
                onClick={() => onExclude(f.name, false)}
            >
                ↺
            </button>
        );
    }
    const idle = `${base} border-grey-line text-grey-500 hover:border-bad hover:bg-bad-soft hover:text-bad`;
    if (f.renamed) {
        return (
            <button
                type="button"
                className={idle}
                title={`Mapping entkoppeln (zurück zu ${f.name})`}
                aria-label={`Mapping für ${f.name} entkoppeln`}
                onClick={() => onMap(f.name, f.name)}
            >
                ×
            </button>
        );
    }
    return (
        <button
            type="button"
            className={idle}
            title={`Feld aus der Migration nehmen (Zielfeld ${f.targetField} wird frei)`}
            aria-label={`${f.name} aus der Migration nehmen`}
            onClick={() => onExclude(f.name, true)}
        >
            ×
        </button>
    );
}

export function TargetCell(props: Props) {
    const { field: f, targetFields, running, onMap } = props;
    if (f.excluded) {
        return (
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-[13px]">{f.targetField}</span>
                <RemoveButton {...props} />
            </div>
        );
    }
    const canEdit = !!targetFields && !running && !f.externalId && f.name !== 'Id';
    if (!canEdit) {
        const why = f.externalId ? 'External-ID-Felder können hier nicht umgemappt werden' : '';
        return (
            <span
                className={`font-mono text-[13px] ${f.renamed ? 'font-bold text-digital-blue' : ''}`}
                title={why}
            >
                {f.targetField}
            </span>
        );
    }
    const names = Object.keys(targetFields)
        .filter((n) => targetFields[n]?.createable || n === f.targetField)
        .sort((a, b) => a.localeCompare(b));
    return (
        <div className="flex items-center gap-1.5">
            <select
                value={f.targetField}
                onChange={(e) => onMap(f.name, e.target.value)}
                aria-label={`Zielfeld für ${f.name}`}
                className={`w-full max-w-[300px] rounded-lg border bg-white px-1.5 py-1 font-mono text-[13px] ${f.renamed ? 'border-digital-blue font-bold text-digital-blue' : 'border-grey-line text-ink'}`}
            >
                {f.renamed && <option value={f.name}>↺ Zurücksetzen ({f.name})</option>}
                {!targetFields[f.targetField] && (
                    <option value={f.targetField}>{f.targetField} (fehlt im Ziel)</option>
                )}
                {names.map((n) => (
                    <option key={n} value={n}>
                        {n} · {targetFields[n]?.type.slice(0, 28)}
                    </option>
                ))}
            </select>
            <RemoveButton {...props} />
        </div>
    );
}
