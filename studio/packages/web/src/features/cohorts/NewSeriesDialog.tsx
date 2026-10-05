import type { Filter } from '@studio/shared';
import { MAX_COHORT_SIZE } from '@studio/shared';
import { useState } from 'react';
import { useCreateSeries, useDescribeObject, useSeriesPreview } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { FilterRow } from '../query/FilterRow';
import { defaultValue, rowProblem } from '../query/filterModel';
import { parseIds } from './cohortText';

interface Props {
    open: boolean;
    rootObject: string;
    onClose: () => void;
    onCreated: (firstCohortId: string) => void;
}

const input = 'rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm';

// Serie anlegen: alle Datensätze nach Erstelldatum in feste Blöcke schneiden, jeder Block wird eine Kohorte.
export function NewSeriesDialog({ open, rootObject, onClose, onCreated }: Props) {
    const create = useCreateSeries();
    const preview = useSeriesPreview();
    const describe = useDescribeObject(open ? rootObject : null);
    const [name, setName] = useState(`Alle ${rootObject}s`);
    const [source, setSource] = useState<'org' | 'ids'>('org');
    const [blockSize, setBlockSize] = useState(MAX_COHORT_SIZE);
    const [filters, setFilters] = useState<Filter[]>([]);
    const [idText, setIdText] = useState('');
    const fields = describe.data?.source.ok ? describe.data.source.fields : null;
    const ids = parseIds(idText);

    const problem = !name.trim()
        ? 'Name fehlt'
        : blockSize < 1 || blockSize > MAX_COHORT_SIZE
          ? `Blockgröße zwischen 1 und ${MAX_COHORT_SIZE}`
          : source === 'ids'
            ? ids.length === 0
                ? 'Mindestens eine Id'
                : null
            : (filters.map(rowProblem).find(Boolean) ?? null);
    const body = {
        blockSize,
        filters: source === 'org' ? filters : [],
        ...(source === 'ids' ? { ids } : {})
    };
    // Eine geänderte Eingabe macht die Vorschau ungültig.
    const stale = JSON.stringify(body);
    const [previewFor, setPreviewFor] = useState('');
    const shown = preview.data && previewFor === stale ? preview.data : null;

    return (
        <Dialog open={open} title="Kohorten-Serie anlegen" onClose={onClose}>
            <p className="mb-4 text-[13px] text-grey-500">
                Schneidet alle {rootObject}s der Quelle nach Erstelldatum (älteste zuerst) in feste
                Blöcke. Jeder Block wird eine Kohorte, jede Id steckt in genau einem Block. So lässt
                sich die ganze Org Stück für Stück durch die Sandbox schicken. Liest nur aus der
                Quelle.
            </p>
            <div className="mb-4 flex flex-wrap gap-4">
                <label className="block min-w-60 flex-1 text-sm">
                    <span className="mb-1 block font-bold">Name der Serie</span>
                    <input
                        className={`${input} w-full`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>
                <label className="block text-sm">
                    <span className="mb-1 block font-bold">
                        Blockgröße (höchstens {MAX_COHORT_SIZE})
                    </span>
                    <input
                        className={`${input} w-32`}
                        type="number"
                        min={1}
                        max={MAX_COHORT_SIZE}
                        value={blockSize}
                        onChange={(e) => setBlockSize(Number(e.target.value))}
                    />
                </label>
            </div>
            <div
                className="mb-4 flex gap-4 text-sm"
                role="radiogroup"
                aria-label="Herkunft der Ids"
            >
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="radio"
                        checked={source === 'org'}
                        onChange={() => setSource('org')}
                    />{' '}
                    Aus der Quelle
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="radio"
                        checked={source === 'ids'}
                        onChange={() => setSource('ids')}
                    />{' '}
                    Eigene Id-Liste
                </label>
            </div>
            {source === 'org' ? (
                <>
                    <p className="mb-1 text-sm font-bold">Nur {rootObject} mit … (optional)</p>
                    {filters.map((f, i) => (
                        <FilterRow
                            key={i}
                            filter={f}
                            fields={fields}
                            disabled={false}
                            onChange={(next) =>
                                setFilters(filters.map((x, j) => (j === i ? next : x)))
                            }
                            onRemove={() => setFilters(filters.filter((_, j) => j !== i))}
                        />
                    ))}
                    <Button
                        variant="ghost"
                        small
                        onClick={() =>
                            setFilters([
                                ...filters,
                                { field: 'Name', op: '=', value: defaultValue('text') }
                            ])
                        }
                    >
                        + Bedingung
                    </Button>
                </>
            ) : (
                <label className="block text-sm">
                    <span className="mb-1 block font-bold">
                        Ids ({ids.length}), die Reihenfolge bleibt erhalten
                    </span>
                    <textarea
                        className={`${input} w-full font-mono text-[13px]`}
                        rows={5}
                        value={idText}
                        onChange={(e) => setIdText(e.target.value)}
                        placeholder="Ids, getrennt durch Leerzeichen, Komma oder Zeilenumbruch"
                    />
                </label>
            )}

            <div className="mt-4 rounded-xl border border-grey-line p-3 text-sm">
                {shown ? (
                    <p className="m-0">
                        <b>{shown.total.toLocaleString('de-DE')}</b> {rootObject}s →{' '}
                        <b>{shown.blocks}</b> Kohorten
                        {shown.blocks > 1 &&
                            ` (${shown.blocks - 1} × ${blockSize}, der letzte Block mit ${shown.lastBlock})`}
                    </p>
                ) : (
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            small
                            disabled={!!problem || preview.isPending}
                            onClick={() =>
                                preview.mutate(body, { onSuccess: () => setPreviewFor(stale) })
                            }
                        >
                            {preview.isPending ? 'Zähle …' : 'Vorschau'}
                        </Button>
                        <span className="text-[13px] text-grey-500">
                            Zeigt, wie viele Kohorten entstehen würden.
                        </span>
                    </div>
                )}
                {preview.isError && (
                    <p role="alert" className="mt-2 mb-0 text-[13px] text-bad">
                        {preview.error.message}
                    </p>
                )}
            </div>
            {create.isError && (
                <p role="alert" className="mt-3 text-[13px] text-bad">
                    {create.error.message}
                </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
                {problem && <span className="mr-auto text-[13px] text-grey-500">{problem}</span>}
                <Button variant="ghost" onClick={onClose}>
                    Abbrechen
                </Button>
                <Button
                    disabled={!!problem || !shown || create.isPending}
                    onClick={() =>
                        create.mutate(
                            { name: name.trim(), ...body },
                            {
                                onSuccess: (r) => {
                                    onCreated(r.firstCohortId);
                                    onClose();
                                }
                            }
                        )
                    }
                >
                    {create.isPending
                        ? 'Lese aus der Quelle …'
                        : shown
                          ? `${shown.blocks} Kohorten anlegen`
                          : 'Serie anlegen'}
                </Button>
            </div>
        </Dialog>
    );
}
