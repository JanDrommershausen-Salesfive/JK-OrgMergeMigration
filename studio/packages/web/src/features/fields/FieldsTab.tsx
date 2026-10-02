import type { DescribeResponse, FieldInfo, ObjectDetail } from '@studio/shared';
import { useSaveExcluded, useSaveMapping } from '../../api/queries';
import { Tag } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { countStatuses, fieldStatus, type FieldStatus } from './fieldStatus';
import { TargetCell } from './TargetCell';

interface Props {
    detail: ObjectDetail;
    describe: DescribeResponse | undefined;
    describeError: string | null;
    onlyDiff: boolean;
    running: boolean;
    report: Report;
    // Ohne diese Funktion (mitgezogene Parents) ist das Wertemapping-Tag nur eine Anzeige.
    onOpenValueMapping?: (field: string) => void;
}

const th =
    'sticky top-0 z-[1] bg-white px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500 border-b border-grey-line';
const td = 'border-b border-grey-100 px-3 py-2 align-top';

function Hints({
    f,
    detail,
    onOpenValueMapping
}: {
    f: FieldInfo;
    detail: ObjectDetail;
    onOpenValueMapping?: (field: string) => void;
}) {
    const count = detail.valueMappings.filter((m) => m.field === f.name).length;
    return (
        <>
            {f.externalId && <Tag tone="key">External ID</Tag>}
            {f.valueMapped && !onOpenValueMapping && <Tag tone="map">Wertemapping ({count})</Tag>}
            {f.valueMapped && onOpenValueMapping && (
                <button
                    type="button"
                    className="mr-1 mb-0.5 cursor-pointer rounded-full bg-open-blue px-2 py-px text-xs font-bold text-black hover:ring-2 hover:ring-digital-blue"
                    title={`Werte-Ersetzungen für ${f.name} anzeigen und bearbeiten`}
                    onClick={() => onOpenValueMapping(f.name)}
                >
                    Wertemapping ({count})
                </button>
            )}
            {f.owner ? (
                <Tag tone="warn">User-Lookup, Owner offen</Tag>
            ) : f.lookup && f.parent ? (
                <Tag>
                    Lookup → {f.parent}
                    {f.parentReadonly ? ' (via Readonly)' : ' (nicht auflösbar)'}
                </Tag>
            ) : (
                f.lookup && <Tag>Lookup</Tag>
            )}
        </>
    );
}

function Summary({ rows }: { rows: { s: FieldStatus }[] }) {
    const c = countStatuses(rows);
    return (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-grey-500">
            <Tag tone="ok">{c.ok} 1:1</Tag>
            <Tag tone="ren">{c.mapped} gemappt</Tag>
            <Tag tone="bad">{c.missing} fehlen im Ziel</Tag>
            <Tag tone="warn">{c.type + c.readonly + c.srcmissing} mit Abweichung</Tag>
            <Tag>{c.excluded} ausgeschlossen</Tag>
        </p>
    );
}

export function FieldsTab({
    detail,
    describe,
    describeError,
    onlyDiff,
    running,
    report,
    onOpenValueMapping
}: Props) {
    const saveMapping = useSaveMapping();
    const saveExcluded = useSaveExcluded();
    const folder = detail.folder;

    const map = (sourceField: string, targetField: string) => {
        report('Speichere …');
        saveMapping.mutate(
            { folder, parentIndex: detail.parentIndex ?? undefined, sourceField, targetField },
            {
                onSuccess: () =>
                    report(`✓ export.json gespeichert: ${sourceField} → ${targetField}`),
                onError: (e) => report(e.message, true)
            }
        );
    };
    const exclude = (field: string, excluded: boolean) => {
        report('Speichere …');
        saveExcluded.mutate(
            { folder, parentIndex: detail.parentIndex ?? undefined, field, excluded },
            {
                onSuccess: () =>
                    report(
                        `✓ export.json gespeichert: ${field} ${excluded ? 'ausgeschlossen' : 'wieder aufgenommen'}`
                    ),
                onError: (e) => report(e.message, true)
            }
        );
    };

    const rows = detail.fields.map((f) => ({ f, s: fieldStatus(f, describe) }));
    const shown = onlyDiff ? rows.filter((r) => r.s.key !== 'ok') : rows;
    const targetFields = describe?.target.ok ? describe.target.fields : null;
    const sourceOk = !!describe?.source.ok;

    return (
        <>
            {!describe && !describeError && (
                <p className="mb-3 text-[13px] text-grey-500">
                    Typen werden aus Quelle und Ziel geladen …
                </p>
            )}
            {describeError && (
                <div className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
                    {describeError}
                </div>
            )}
            {describe && !describe.target.ok && (
                <div className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
                    Ziel-Describe fehlgeschlagen: {describe.target.error}. Es wird nur die Feldliste
                    ohne Abgleich gezeigt.
                </div>
            )}
            {describe && !describe.source.ok && (
                <div className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
                    Quell-Describe fehlgeschlagen: {describe.source.error}. Quelltypen fehlen.
                </div>
            )}
            {describe && <Summary rows={rows} />}
            {!shown.length ? (
                <p className="py-6 text-grey-500">Keine Abweichungen.</p>
            ) : (
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr>
                            <th className={`${th} border-b-0 pb-0 text-digital-blue`} colSpan={2}>
                                QUELLE
                            </th>
                            <th className={`${th} border-b-0`} />
                            <th className={`${th} border-b-0 pb-0 text-digital-blue`} colSpan={2}>
                                ZIEL
                            </th>
                            <th className={`${th} border-b-0`} />
                            <th className={`${th} border-b-0`} />
                        </tr>
                        <tr>
                            <th className={th}>API-Name</th>
                            <th className={th}>Typ</th>
                            <th className={th} />
                            <th className={th}>API-Name</th>
                            <th className={th}>Typ</th>
                            <th className={th}>Status</th>
                            <th className={th}>Hinweise</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(({ f, s }) => {
                            const srcType = s.src ? s.src.type : sourceOk ? '–' : '';
                            const tgtType = s.tgt ? s.tgt.type : s.key === 'missing' ? '–' : '';
                            const dim = f.excluded ? 'text-grey-500' : '';
                            return (
                                <tr key={f.name}>
                                    <td
                                        className={`${td} font-mono text-[13px] ${dim} ${f.excluded ? 'line-through' : ''}`}
                                    >
                                        {f.name}
                                    </td>
                                    <td
                                        className={`${td} font-mono text-[13px] whitespace-nowrap text-grey-500`}
                                    >
                                        {srcType}
                                    </td>
                                    <td
                                        className={`${td} w-7 px-0 text-center ${f.renamed ? 'font-bold text-digital-blue' : 'text-grey-500'}`}
                                    >
                                        →
                                    </td>
                                    <td className={td}>
                                        <TargetCell
                                            field={f}
                                            targetFields={targetFields}
                                            running={running}
                                            onMap={map}
                                            onExclude={exclude}
                                        />
                                    </td>
                                    <td
                                        className={`${td} font-mono text-[13px] whitespace-nowrap ${s.key === 'type' ? 'font-bold text-warn' : 'text-grey-500'}`}
                                    >
                                        {tgtType}
                                    </td>
                                    <td className={td}>
                                        <Tag tone={s.tone}>{s.label}</Tag>
                                    </td>
                                    <td className={td}>
                                        <Hints
                                            f={f}
                                            detail={detail}
                                            onOpenValueMapping={onOpenValueMapping}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </>
    );
}
