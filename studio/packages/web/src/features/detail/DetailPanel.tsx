import { useState, type ReactNode } from 'react';
import { useDescribe, useObject } from '../../api/queries';
import { Tag } from '../../components/ui';
import { FieldsTab } from '../fields/FieldsTab';
import { ValuesTab } from '../values/ValuesTab';
import { useSaveMessage } from './saveMessage';

type Tab = 'fields' | 'values';

// toolbar: Lauf-Leiste, sitzt zwischen Kopf und Tabs.
export function DetailPanel({
    folder,
    running,
    toolbar
}: {
    folder: string;
    running: boolean;
    toolbar: ReactNode;
}) {
    const object = useObject(folder);
    const describe = useDescribe(folder);
    const [tab, setTab] = useState<Tab>('fields');
    const [valueField, setValueField] = useState<string | null>(null);
    const [onlyDiff, setOnlyDiff] = useState(false);
    const { message, report } = useSaveMessage();

    const d = object.data;
    if (object.error) return <p className="p-6 text-bad">{object.error.message}</p>;
    if (!d) return <p className="p-6 text-grey-500">Lade …</p>;

    const tabClass = (t: Tab) =>
        `-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-bold ${tab === t ? 'border-digital-blue text-digital-blue' : 'border-transparent text-grey-500 hover:text-ink'}`;

    return (
        <>
            <div className="px-6 pt-4">
                <p className="mb-1 text-xs font-bold text-digital-blue">
                    {d.folder.split('_')[0]} · Objekt
                </p>
                <h3 className="text-[28px] leading-tight font-normal tracking-tighter">
                    {d.object}
                </h3>
                <div className="mt-3 mb-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-open-blue px-2.5 py-0.5 text-xs font-bold text-black">
                        {d.operation}
                    </span>
                    <Tag>External ID: {d.externalId ?? 'keine, Insert erzeugt Duplikate'}</Tag>
                    <Tag>
                        Readonly-Parents:{' '}
                        {d.readonlyParents.length ? d.readonlyParents.join(', ') : 'keine'}
                    </Tag>
                    {d.where && (
                        <span
                            className="rounded-full bg-grey-100 px-2.5 py-0.5 font-mono text-xs"
                            title="Filter der Query"
                        >
                            {d.where}
                        </span>
                    )}
                </div>
            </div>

            {toolbar}

            <div role="tablist" className="flex items-center gap-2 border-b border-grey-line px-6">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'fields'}
                    className={tabClass('fields')}
                    onClick={() => setTab('fields')}
                >
                    Felder ({d.fields.length})
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'values'}
                    className={tabClass('values')}
                    onClick={() => {
                        setValueField(null);
                        setTab('values');
                    }}
                >
                    Wertemapping ({d.valueMappings.length})
                </button>
                <span className="flex-1" />
                {message && (
                    <span
                        role="status"
                        className={`mr-3 text-[13px] ${message.error ? 'text-bad' : 'text-ok'}`}
                    >
                        {message.text}
                    </span>
                )}
                {tab === 'fields' && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input
                            type="checkbox"
                            checked={onlyDiff}
                            onChange={(e) => setOnlyDiff(e.target.checked)}
                        />{' '}
                        nur Abweichungen
                    </label>
                )}
            </div>

            <div role="tabpanel" className="max-h-[560px] overflow-auto px-6 pt-4 pb-6">
                {tab === 'fields' ? (
                    <FieldsTab
                        detail={d}
                        describe={describe.data}
                        describeError={describe.error?.message ?? null}
                        onlyDiff={onlyDiff}
                        running={running}
                        report={report}
                        onOpenValueMapping={(field) => {
                            setValueField(field);
                            setTab('values');
                        }}
                    />
                ) : (
                    <ValuesTab
                        detail={d}
                        filterField={valueField}
                        running={running}
                        report={report}
                        onFilterChange={setValueField}
                    />
                )}
            </div>
        </>
    );
}
