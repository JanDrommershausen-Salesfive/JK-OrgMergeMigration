import {
    isOrGroup,
    type DescribedField,
    type Filter,
    type FilterNode,
    type QueryModel
} from '@studio/shared';
import { useState } from 'react';
import { useSaveFilters } from '../../api/queries';
import { Button } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { FilterRow } from './FilterRow';
import { allFilters, defaultValue, normaliseNodes, rowProblem } from './filterModel';

interface Props {
    model: QueryModel;
    sourceFields: Record<string, DescribedField> | null;
    running: boolean;
    report: Report;
}

const Connector = ({ children }: { children: string }) => (
    <div className="my-1 text-xs font-bold text-grey-500">{children}</div>
);

// Filter als Bedingungen, die alle zutreffen müssen (UND). Eine ODER-Gruppe verlangt, dass mindestens eine ihrer
// Bedingungen zutrifft. Ist der WHERE-Teil nicht so darstellbar (zum Beispiel verschachtelte Klammern oder
// Unterabfragen), wird er als Text bearbeitet; "Als Text bearbeiten" gibt es zusätzlich.
export function FilterEditor({ model, sourceFields, running, report }: Props) {
    const save = useSaveFilters(model.folder);
    const [nodes, setNodes] = useState<FilterNode[]>(model.filters ?? []);
    const [text, setText] = useState(model.rawWhere ?? '');
    const [asText, setAsText] = useState(model.filters === null);
    const [dirty, setDirty] = useState(false);
    const problems = allFilters(nodes)
        .map(rowProblem)
        .filter((p): p is string => p !== null);
    const edit = (next: FilterNode[]) => {
        setNodes(next);
        setDirty(true);
    };
    const blank = (): Filter => ({
        field: model.fields.find((f) => f !== 'Id') ?? 'Id',
        op: '=',
        value: defaultValue('text')
    });

    const persist = () => {
        report('Speichere …');
        const body = asText
            ? { folder: model.folder, rawWhere: text }
            : { folder: model.folder, filters: normaliseNodes(nodes) };
        save.mutate(body, {
            onSuccess: () => {
                setDirty(false);
                report('✓ Filter in export.json gespeichert');
            },
            onError: (e) => report(e.message, true)
        });
    };
    const replace = (i: number, node: FilterNode) =>
        edit(nodes.map((n, j) => (j === i ? node : n)));
    const row = (f: Filter, onChange: (next: Filter) => void, onRemove: () => void) => (
        <FilterRow
            filter={f}
            fields={sourceFields}
            disabled={running}
            onChange={onChange}
            onRemove={onRemove}
        />
    );

    return (
        <section>
            <div className="mb-2 flex items-center gap-3">
                <h3 className="text-sm font-bold">Filter</h3>
                <button
                    type="button"
                    className="cursor-pointer text-[13px] text-digital-blue underline disabled:opacity-40"
                    disabled={running || (asText && model.filters === null)}
                    onClick={() => setAsText((t) => !t)}
                >
                    {asText ? 'Als Zeilen bearbeiten' : 'Als Text bearbeiten'}
                </button>
            </div>
            {asText ? (
                <>
                    {model.filters === null && (
                        <p className="mb-2 text-[13px] text-grey-500">
                            Der WHERE-Teil ist zu verschachtelt oder enthält Unterabfragen und wird
                            deshalb als Text bearbeitet.
                        </p>
                    )}
                    <textarea
                        className="w-full rounded-lg border border-grey-line bg-white p-2 font-mono text-[13px]"
                        rows={3}
                        disabled={running}
                        value={text}
                        aria-label="WHERE-Text"
                        placeholder="Leer: keine Einschränkung"
                        onChange={(e) => {
                            setText(e.target.value);
                            setDirty(true);
                        }}
                    />
                </>
            ) : (
                <>
                    {nodes.length === 0 && (
                        <p className="mb-2 text-[13px] text-grey-500">
                            Kein Filter: alle Datensätze des Objekts.
                        </p>
                    )}
                    {nodes.map((n, i) => (
                        <div key={i}>
                            {i > 0 && <Connector>UND</Connector>}
                            {isOrGroup(n) ? (
                                <div
                                    className="rounded-xl border border-grey-line bg-grey-100/50 p-3"
                                    role="group"
                                    aria-label="ODER-Gruppe"
                                >
                                    <div className="mb-2 flex items-center gap-2 text-[13px] text-grey-500">
                                        <span>
                                            Mindestens eine dieser Bedingungen trifft zu (ODER)
                                        </span>
                                        <span className="flex-1" />
                                        <button
                                            type="button"
                                            disabled={running}
                                            className="cursor-pointer text-digital-blue underline disabled:opacity-40"
                                            onClick={() => edit(nodes.filter((_, j) => j !== i))}
                                        >
                                            Gruppe entfernen
                                        </button>
                                    </div>
                                    {n.or.map((f, k) => (
                                        <div key={k}>
                                            {k > 0 && <Connector>ODER</Connector>}
                                            {row(
                                                f,
                                                (next) =>
                                                    replace(i, {
                                                        or: n.or.map((x, m) => (m === k ? next : x))
                                                    }),
                                                () =>
                                                    replace(i, {
                                                        or: n.or.filter((_, m) => m !== k)
                                                    })
                                            )}
                                        </div>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        small
                                        disabled={running}
                                        onClick={() => replace(i, { or: [...n.or, blank()] })}
                                    >
                                        + Bedingung in Gruppe
                                    </Button>
                                </div>
                            ) : (
                                row(
                                    n,
                                    (next) => replace(i, next),
                                    () => edit(nodes.filter((_, j) => j !== i))
                                )
                            )}
                        </div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                            variant="ghost"
                            small
                            disabled={running}
                            onClick={() => edit([...nodes, blank()])}
                        >
                            + Bedingung
                        </Button>
                        <Button
                            variant="ghost"
                            small
                            disabled={running}
                            onClick={() => edit([...nodes, { or: [blank(), blank()] }])}
                        >
                            + ODER-Gruppe
                        </Button>
                    </div>
                </>
            )}
            {!asText && problems.length > 0 && (
                <p role="alert" className="mt-2 text-[13px] text-bad">
                    {problems[0]}
                </p>
            )}
            <div className="mt-3 flex items-center gap-3">
                <Button
                    small
                    disabled={
                        running || !dirty || (!asText && problems.length > 0) || save.isPending
                    }
                    onClick={persist}
                >
                    Filter speichern
                </Button>
                {dirty && (
                    <span className="text-[13px] text-grey-500">Nicht gespeicherte Änderungen</span>
                )}
            </div>
        </section>
    );
}
