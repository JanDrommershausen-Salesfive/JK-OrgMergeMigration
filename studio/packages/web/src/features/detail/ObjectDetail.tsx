import { useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router';
import { useObject } from '../../api/queries';
import { Button, Tag } from '../../components/ui';
import { MappingTab } from '../mapping/MappingTab';
import { formatWhen, lastRunFindings, modeLabel } from '../results/format';
import { useRunContext } from '../run/RunContext';
import { QueryTab } from '../query/QueryTab';
import { ValuesPage } from '../values/ValuesPage';
import { useSaveMessage } from './saveMessage';

// Reihenfolge entspricht dem Ablauf: Query (was lese ich), Mapping (wohin damit), Werte (welche Werte ändern sich).
export type ConfigTab = 'query' | 'mapping' | 'werte';

interface Props {
    folder: string;
    tab: ConfigTab;
    onStartRun: (folder: string) => void;
}

// Konfiguration eines Objekts: Kopf mit Lauf-Status und -Start, darunter Felder und Wertemapping.
export function ObjectDetail({ folder, tab, onStartRun }: Props) {
    const object = useObject(folder);
    const run = useRunContext();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [onlyDiff, setOnlyDiff] = useState(false);
    const { message, report } = useSaveMessage();

    const d = object.data;
    if (object.error) return <p className="p-6 text-bad">{object.error.message}</p>;
    if (!d) return <p className="p-6 text-grey-500">Lade …</p>;

    const last = d.lastRun;
    const tabClass = ({ isActive }: { isActive: boolean }) =>
        `-mb-px border-b-2 px-3 py-2 text-sm font-bold ${isActive ? 'border-digital-blue text-digital-blue' : 'border-transparent text-grey-500 hover:text-ink'}`;

    return (
        <>
            <div className="flex flex-wrap items-start gap-4 px-6 pt-4">
                <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-bold text-digital-blue">
                        {d.folder.split('_')[0]} · Objekt
                    </p>
                    <h2 className="text-[28px] leading-tight font-normal tracking-tighter">
                        {d.object}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="flex flex-col items-end gap-2">
                    <Button disabled={run.running} onClick={() => onStartRun(folder)}>
                        Lauf starten
                    </Button>
                    {last && (
                        <p className="text-right text-xs text-grey-500">
                            Letzter Lauf: {last.ok ? '✓' : '✕'} {modeLabel(last.mode)},{' '}
                            {formatWhen(last.at)}
                            {lastRunFindings(last) && ` · ${lastRunFindings(last)}`}
                            {last.runId && (
                                <>
                                    {' · '}
                                    <Link
                                        className="font-bold text-digital-blue underline"
                                        to={`/laeufe/${folder}/${last.runId}`}
                                    >
                                        Ergebnis
                                    </Link>
                                </>
                            )}
                        </p>
                    )}
                </div>
            </div>

            <div
                role="tablist"
                className="mt-4 flex items-center gap-2 border-b border-grey-line px-6"
            >
                <NavLink role="tab" to={`/konfiguration/${folder}/query`} className={tabClass}>
                    Query ({d.fields.length})
                </NavLink>
                <NavLink role="tab" to={`/konfiguration/${folder}/mapping`} className={tabClass}>
                    Mapping
                </NavLink>
                <NavLink role="tab" to={`/konfiguration/${folder}/werte`} className={tabClass}>
                    Wertemapping ({d.valueMappings.length})
                </NavLink>
                <span className="flex-1" />
                {message && (
                    <span
                        role="status"
                        className={`mr-3 text-[13px] ${message.error ? 'text-bad' : 'text-ok'}`}
                    >
                        {message.text}
                    </span>
                )}
                {tab === 'mapping' && (
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

            <div role="tabpanel" className="max-h-[65vh] overflow-auto px-6 pt-4 pb-6">
                {tab === 'mapping' ? (
                    <MappingTab
                        folder={folder}
                        object={d.object}
                        onlyDiff={onlyDiff}
                        running={run.running}
                        report={report}
                        onOpenValueMapping={(field) =>
                            navigate(
                                `/konfiguration/${folder}/werte?feld=${encodeURIComponent(field)}`
                            )
                        }
                    />
                ) : tab === 'query' ? (
                    <QueryTab folder={folder} running={run.running} report={report} />
                ) : (
                    <ValuesPage
                        folder={folder}
                        object={d.object}
                        filterField={params.get('feld')}
                        running={run.running}
                        report={report}
                        onFilterChange={(field) =>
                            navigate(
                                `/konfiguration/${folder}/werte${field ? `?feld=${encodeURIComponent(field)}` : ''}`
                            )
                        }
                    />
                )}
            </div>
        </>
    );
}
