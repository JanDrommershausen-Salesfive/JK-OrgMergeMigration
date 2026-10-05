import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCohorts } from '../api/queries';
import { Button, Panel } from '../components/ui';
import { CohortDetail } from '../features/cohorts/CohortDetail';
import { CohortList } from '../features/cohorts/CohortList';
import { NewSeriesDialog } from '../features/cohorts/NewSeriesDialog';
import { CohortsIntro } from '../features/cohorts/CohortsIntro';
import { NewCohortDialog } from '../features/cohorts/NewCohortDialog';

// Kohorten: feste Mengen von Account-Datensätzen für Batch-Läufe in kleiner Sandbox.
export function CohortsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const cohorts = useCohorts();
    const [creating, setCreating] = useState(false);
    const [creatingSeries, setCreatingSeries] = useState(false);
    const list = cohorts.data?.cohorts ?? [];
    const selected = list.find((c) => c.id === id) ?? null;

    if (cohorts.isPending) return <p className="text-grey-500">Lade …</p>;
    return (
        <>
            <CohortsIntro />
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <Panel label="Kohorten">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <h2 className="text-xs font-bold text-digital-blue">KOHORTEN</h2>
                        <div className="flex gap-2">
                            <Button small variant="ghost" onClick={() => setCreatingSeries(true)}>
                                Serie …
                            </Button>
                            <Button small onClick={() => setCreating(true)}>
                                + Neu
                            </Button>
                        </div>
                    </div>
                    {!list.length && (
                        <p className="p-4 text-sm text-grey-500">
                            Noch keine Kohorte. Lege eine an, um mit einer Auswahl von Accounts zu
                            testen.
                        </p>
                    )}
                    <CohortList cohorts={list} />
                </Panel>
                <Panel label="Kohorten-Details">
                    {selected ? (
                        <CohortDetail
                            key={selected.id}
                            cohort={selected}
                            onDeleted={() => navigate('/kohorten')}
                        />
                    ) : (
                        <p className="p-8 text-center text-grey-500">
                            {list.length
                                ? 'Wähle links eine Kohorte.'
                                : 'Eine Kohorte begrenzt einen Lauf auf eine feste Auswahl von Accounts und alles, was daran hängt.'}
                        </p>
                    )}
                </Panel>
                <NewSeriesDialog
                    open={creatingSeries}
                    rootObject="Account"
                    onClose={() => setCreatingSeries(false)}
                    onCreated={(firstId) => navigate(`/kohorten/${firstId}`)}
                />
                <NewCohortDialog
                    open={creating}
                    rootObject="Account"
                    onClose={() => setCreating(false)}
                    onCreated={(newId) => navigate(`/kohorten/${newId}`)}
                />
            </div>
        </>
    );
}
