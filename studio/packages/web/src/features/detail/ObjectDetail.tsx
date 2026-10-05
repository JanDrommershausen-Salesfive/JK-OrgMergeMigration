import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useObject, useTodos } from '../../api/queries';
import { Tag } from '../../components/ui';
import { MappingTab } from '../mapping/MappingTab';
import { QueryTab } from '../query/QueryTab';
import { useCurrentVersion } from '../presets/useCurrentVersion';
import { TodoDrawer } from '../todos/TodoDrawer';
import { VersionDrawer } from '../presets/VersionDrawer';
import { useRunContext } from '../run/RunContext';
import { ValuesPage } from '../values/ValuesPage';
import { ConfigFlow, type ConfigStep } from './ConfigFlow';
import { OverviewTab } from './OverviewTab';
import { RunBar } from './RunBar';
import { useSaveMessage } from './saveMessage';
import { StepPage } from './StepPage';

export type ConfigTab = ConfigStep;

interface Props {
    folder: string;
    tab: ConfigTab;
    onStartRun: (folder: string) => void;
}

// Konfiguration eines Objekts als geführter Ablauf: Kopfzeile, Schrittband, Inhalt des Schritts
// und unten die Lauf-Leiste. Versionen liegen in einer Seitenleiste.
export function ObjectDetail({ folder, tab, onStartRun }: Props) {
    const object = useObject(folder);
    const run = useRunContext();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [onlyDiff, setOnlyDiff] = useState(false);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [todosOpen, setTodosOpen] = useState(false);
    const todos = useTodos();
    const version = useCurrentVersion(folder);
    const { message, report } = useSaveMessage();

    const d = object.data;
    if (object.error) return <p className="p-6 text-bad">{object.error.message}</p>;
    if (!d) return <p className="p-6 text-grey-500">Lade …</p>;

    const base = `/konfiguration/${folder}`;
    const openTodos = (todos.data?.items ?? []).filter(
        (t) => t.object === d.object && (t.status === 'open' || t.status === 'doing')
    ).length;
    const versionLabel = version.saved
        ? version.name
        : version.saved === false
          ? 'nicht gespeichert'
          : '…';

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
                <button
                    type="button"
                    onClick={() => setTodosOpen(true)}
                    className="cursor-pointer rounded-full border border-grey-line px-4 py-1.5 text-[13px] font-bold text-ink hover:border-ink"
                >
                    To-Dos{openTodos ? ` (${openTodos})` : ''}
                </button>
                <button
                    type="button"
                    onClick={() => setVersionsOpen(true)}
                    className={`cursor-pointer rounded-full border px-4 py-1.5 text-[13px] font-bold ${version.saved === false ? 'border-warn text-warn' : 'border-grey-line text-ink hover:border-ink'}`}
                >
                    Version: {versionLabel} ▾
                </button>
            </div>

            <ConfigFlow folder={folder} current={tab} />
            <div className="mx-6 border-b border-grey-line" />

            <div className="px-6 pt-5 pb-6">
                {tab === 'uebersicht' && (
                    <StepPage
                        title="Übersicht"
                        guidance="So steht die Konfiguration dieses Objekts. Prüfe die drei Teile der Reihe nach oder springe direkt zu einem."
                        message={message}
                        next={{ to: `${base}/query`, label: 'Setup starten' }}
                    >
                        <OverviewTab detail={d} onOpenVersions={() => setVersionsOpen(true)} />
                    </StepPage>
                )}
                {tab === 'query' && (
                    <StepPage
                        title="1 Query: Was wird gelesen?"
                        guidance="Wähle Felder und Filter der Quelle. Parents lassen sich nur lesen oder mitziehen."
                        message={message}
                        back={{ to: `${base}/uebersicht`, label: 'Zurück' }}
                        next={{ to: `${base}/mapping`, label: 'Weiter zu Mapping' }}
                    >
                        <QueryTab folder={folder} running={run.running} report={report} />
                    </StepPage>
                )}
                {tab === 'mapping' && (
                    <StepPage
                        title="2 Mapping: Wohin damit?"
                        guidance="Ordne Quellfelder den Zielfeldern zu und prüfe Abweichungen sowie offene Pflichtfelder im Ziel."
                        message={message}
                        toolbar={
                            <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                                <input
                                    type="checkbox"
                                    checked={onlyDiff}
                                    onChange={(e) => setOnlyDiff(e.target.checked)}
                                />{' '}
                                nur Abweichungen
                            </label>
                        }
                        back={{ to: `${base}/query`, label: 'Zurück' }}
                        next={{ to: `${base}/werte`, label: 'Weiter zu Wertemapping' }}
                    >
                        <MappingTab
                            folder={folder}
                            object={d.object}
                            onlyDiff={onlyDiff}
                            running={run.running}
                            report={report}
                            onOpenValueMapping={(field) =>
                                navigate(`${base}/werte?feld=${encodeURIComponent(field)}`)
                            }
                        />
                    </StepPage>
                )}
                {tab === 'werte' && (
                    <StepPage
                        title="3 Wertemapping: Welche Werte ändern sich?"
                        guidance="Übersetze Werte, die im Ziel anders heißen, zum Beispiel Picklist-Einträge oder Länder."
                        message={message}
                        back={{ to: `${base}/mapping`, label: 'Zurück' }}
                        next={{ to: `${base}/uebersicht`, label: 'Setup abschließen ✓' }}
                    >
                        <ValuesPage
                            folder={folder}
                            object={d.object}
                            filterField={params.get('feld')}
                            running={run.running}
                            report={report}
                            onFilterChange={(field) =>
                                navigate(
                                    `${base}/werte${field ? `?feld=${encodeURIComponent(field)}` : ''}`
                                )
                            }
                        />
                    </StepPage>
                )}
            </div>

            <RunBar
                folder={folder}
                object={d.object}
                last={d.lastRun}
                running={run.running}
                onStart={() => onStartRun(folder)}
            />
            <TodoDrawer object={d.object} open={todosOpen} onClose={() => setTodosOpen(false)} />
            <VersionDrawer
                folder={folder}
                object={d.object}
                open={versionsOpen}
                running={run.running}
                report={report}
                onClose={() => setVersionsOpen(false)}
            />
        </>
    );
}
