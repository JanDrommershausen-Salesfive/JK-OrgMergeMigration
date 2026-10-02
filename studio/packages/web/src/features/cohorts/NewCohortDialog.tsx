import type { Filter } from '@studio/shared';
import { MAX_COHORT_SIZE } from '@studio/shared';
import { useState } from 'react';
import { useCreateCohort, useDescribeObject } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { FilterRow } from '../query/FilterRow';
import { defaultValue, rowProblem } from '../query/filterModel';
import { parseIds } from './cohortText';

interface Props {
    open: boolean;
    rootObject: string;
    onClose: () => void;
    onCreated: (id: string) => void;
}

const input = 'rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm';

// Neue Kohorte: entweder eine zufällige Stichprobe (optional gefiltert) oder eine feste Liste von Ids.
export function NewCohortDialog({ open, rootObject, onClose, onCreated }: Props) {
    const create = useCreateCohort();
    const describe = useDescribeObject(open ? rootObject : null);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<'sample' | 'ids'>('sample');
    const [size, setSize] = useState(50);
    const [filters, setFilters] = useState<Filter[]>([]);
    const [idText, setIdText] = useState('');
    const fields = describe.data?.source.ok ? describe.data.source.fields : null;

    const ids = parseIds(idText);
    const problem = !name.trim()
        ? 'Name fehlt'
        : kind === 'sample'
          ? size < 1 || size > MAX_COHORT_SIZE
              ? `Größe zwischen 1 und ${MAX_COHORT_SIZE}`
              : (filters.map(rowProblem).find(Boolean) ?? null)
          : ids.length === 0
            ? 'Mindestens eine Id'
            : ids.length > MAX_COHORT_SIZE
              ? `Höchstens ${MAX_COHORT_SIZE} Ids`
              : null;

    const submit = () => {
        const rule =
            kind === 'sample'
                ? { kind: 'sample' as const, size, filters }
                : { kind: 'ids' as const, ids };
        create.mutate(
            { name: name.trim(), rule },
            {
                onSuccess: (c) => {
                    onCreated(c.id);
                    onClose();
                }
            }
        );
    };

    return (
        <Dialog open={open} title="Neue Kohorte" onClose={onClose}>
            <p className="mb-4 text-[13px] text-grey-500">
                Eine Kohorte ist eine feste Menge von {rootObject}-Datensätzen. Läufe auf eine
                Kohorte holen nur diese und alles, was daran hängt. Die Auswahl liest nur aus der
                Quelle und wird eingefroren.
            </p>
            <label className="mb-4 block text-sm">
                <span className="mb-1 block font-bold">Name</span>
                <input
                    className={`${input} w-full`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z. B. Test 50"
                />
            </label>
            <div className="mb-4 flex gap-4 text-sm" role="radiogroup" aria-label="Art der Kohorte">
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="radio"
                        checked={kind === 'sample'}
                        onChange={() => setKind('sample')}
                    />{' '}
                    Zufällige Stichprobe
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" checked={kind === 'ids'} onChange={() => setKind('ids')} />{' '}
                    Feste Liste von Ids
                </label>
            </div>
            {kind === 'sample' ? (
                <>
                    <label className="mb-3 block text-sm">
                        <span className="mb-1 block font-bold">
                            Größe (höchstens {MAX_COHORT_SIZE})
                        </span>
                        <input
                            className={`${input} w-32`}
                            type="number"
                            min={1}
                            max={MAX_COHORT_SIZE}
                            value={size}
                            onChange={(e) => setSize(Number(e.target.value))}
                        />
                    </label>
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
                    <span className="mb-1 block font-bold">Ids ({ids.length})</span>
                    <textarea
                        className={`${input} w-full font-mono text-[13px]`}
                        rows={5}
                        value={idText}
                        onChange={(e) => setIdText(e.target.value)}
                        placeholder="Ids, getrennt durch Leerzeichen, Komma oder Zeilenumbruch"
                    />
                </label>
            )}
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
                <Button disabled={!!problem || create.isPending} onClick={submit}>
                    {create.isPending ? 'Lese aus der Quelle …' : 'Kohorte anlegen'}
                </Button>
            </div>
        </Dialog>
    );
}
