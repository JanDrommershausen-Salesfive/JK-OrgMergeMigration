import type { DescribedField, ObjectDetail } from '@studio/shared';
import { useState } from 'react';
import { useChangeFields, useSaveMapping } from '../../api/queries';
import { Button } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { NOT_LISTED } from '../query/FieldChecklist';
import { syncMessage } from '../values/syncMessage';

interface Props {
    detail: ObjectDetail;
    source: Record<string, DescribedField>;
    target: Record<string, DescribedField>;
    running: boolean;
    report: Report;
}

const select =
    'w-full max-w-[300px] rounded-lg border border-grey-line bg-white px-1.5 py-1 font-mono text-[13px] text-ink';

// Quellfelder, die noch nicht in der Query stehen, und Zielfelder, die noch frei sind.
export function addableFields(
    detail: ObjectDetail,
    source: Record<string, DescribedField>,
    target: Record<string, DescribedField>
) {
    const inQuery = new Set(detail.fields.map((f) => f.name.toLowerCase()));
    const used = new Set(detail.fields.filter((f) => !f.excluded).map((f) => f.targetField));
    const sources = Object.keys(source)
        .filter((n) => !inQuery.has(n.toLowerCase()) && !NOT_LISTED.has(source[n]?.baseType ?? ''))
        .sort((a, b) => a.localeCompare(b));
    const targets = Object.keys(target)
        .filter((n) => target[n]?.createable && !used.has(n))
        .sort((a, b) => a.localeCompare(b));
    return { sources, targets };
}

// Nimmt ein Quellfeld direkt im Mapping in die Query auf und ordnet es gleich einem Zielfeld zu.
export function AddField({ detail, source, target, running, report }: Props) {
    const changeFields = useChangeFields(detail.folder);
    const saveMapping = useSaveMapping();
    const [src, setSrc] = useState('');
    const [tgt, setTgt] = useState('');
    const { sources, targets } = addableFields(detail, source, target);
    const busy = running || changeFields.isPending || saveMapping.isPending;
    const parentIndex = detail.parentIndex ?? undefined;

    const pickSource = (name: string) => {
        setSrc(name);
        // Gleichnamiges Zielfeld vorschlagen, sonst muss die Person wählen.
        setTgt(targets.includes(name) ? name : '');
    };

    const add = () => {
        report('Speichere …');
        let sync: ReturnType<typeof syncMessage> = null;
        const done = () => {
            report(`✓ ${src} → ${tgt} aufgenommen${sync ? ` · ${sync.text}` : ''}`, sync?.error);
            setSrc('');
            setTgt('');
        };
        changeFields.mutate(
            { folder: detail.folder, parentIndex, add: [src], remove: [] },
            {
                onSuccess: (m) => {
                    sync = syncMessage(m.valueMappingSync);
                    if (tgt === src) return done();
                    saveMapping.mutate(
                        { folder: detail.folder, parentIndex, sourceField: src, targetField: tgt },
                        {
                            onSuccess: done,
                            onError: (e) =>
                                report(
                                    `${src} ist in der Query, das Mapping auf ${tgt} schlug fehl: ${e.message}`,
                                    true
                                )
                        }
                    );
                },
                onError: (e) => report(e.message, true)
            }
        );
    };

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-grey-line px-4 py-3">
            <span className="text-sm font-bold">Feld hinzufügen</span>
            <select
                value={src}
                onChange={(e) => pickSource(e.target.value)}
                disabled={busy || !sources.length}
                aria-label="Quellfeld hinzufügen"
                className={select}
            >
                <option value="">
                    {sources.length ? 'Quellfeld wählen …' : 'Alle Quellfelder sind in der Query'}
                </option>
                {sources.map((n) => (
                    <option key={n} value={n}>
                        {n} · {source[n]?.type.slice(0, 28)}
                    </option>
                ))}
            </select>
            <span className="text-grey-500">→</span>
            <select
                value={tgt}
                onChange={(e) => setTgt(e.target.value)}
                disabled={busy || !src}
                aria-label="Zielfeld für neues Feld"
                className={select}
            >
                <option value="">Zielfeld wählen …</option>
                {targets.map((n) => (
                    <option key={n} value={n}>
                        {n} · {target[n]?.type.slice(0, 28)}
                    </option>
                ))}
            </select>
            <Button small onClick={add} disabled={busy || !src || !tgt}>
                Hinzufügen
            </Button>
        </div>
    );
}
