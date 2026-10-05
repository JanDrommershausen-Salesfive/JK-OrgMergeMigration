import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useObjects } from '../api/queries';
import { Panel } from '../components/ui';
import { ObjectDetail, type ConfigTab } from '../features/detail/ObjectDetail';
import { ObjectList } from '../features/objects/ObjectList';
import { StartRunDialog } from '../features/run/StartRunDialog';

export function ConfigPage() {
    const { folder, tab } = useParams();
    const objects = useObjects();
    const [runFolder, setRunFolder] = useState<string | null>(null);
    const list = objects.data?.objects ?? [];

    if (objects.isPending) return <p className="text-grey-500">Lade …</p>;
    if (!folder) {
        return list[0] ? (
            <Navigate to={`/konfiguration/${list[0].folder}/uebersicht`} replace />
        ) : (
            <p>Keine Objekte.</p>
        );
    }
    // Alte Adressen (felder, wertemapping) und unbekannte Reiter führen zum passenden neuen Reiter.
    const renamed: Record<string, ConfigTab> = { felder: 'mapping', wertemapping: 'werte' };
    const known: ConfigTab[] = ['uebersicht', 'query', 'mapping', 'werte'];
    if (!tab || !known.includes(tab as ConfigTab)) {
        return (
            <Navigate
                to={`/konfiguration/${folder}/${(tab && renamed[tab]) || 'uebersicht'}`}
                replace
            />
        );
    }

    return (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <Panel label="Objekte">
                <h2 className="px-4 pt-4 pb-2 text-xs font-bold text-digital-blue">OBJEKTE</h2>
                <ObjectList objects={list} />
            </Panel>
            <Panel label="Objekt-Konfiguration">
                <ObjectDetail
                    key={folder}
                    folder={folder}
                    tab={tab as ConfigTab}
                    onStartRun={setRunFolder}
                />
            </Panel>
            <StartRunDialog folder={runFolder} onClose={() => setRunFolder(null)} />
        </div>
    );
}
