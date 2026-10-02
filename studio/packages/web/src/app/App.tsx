import type { RunMode } from '@studio/shared';
import { useState } from 'react';
import { useObjects, useOrgs } from '../api/queries';
import { Panel } from '../components/ui';
import { DetailPanel } from '../features/detail/DetailPanel';
import { ObjectList } from '../features/objects/ObjectList';
import { OrgHeader } from '../features/orgs/OrgHeader';
import { OrgPicker } from '../features/orgs/OrgPicker';
import { RunToolbar } from '../features/run/RunToolbar';
import { Terminal } from '../features/run/Terminal';
import { useRun } from '../features/run/useRun';

export function App() {
    const objects = useObjects();
    const configured = objects.data?.configured ?? false;
    const orgs = useOrgs(configured);
    const run = useRun();
    const [picked, setPicked] = useState<string | null>(null);
    const [mode, setMode] = useState<RunMode>('simulation');
    const [pickerOpen, setPickerOpen] = useState(false);

    const list = objects.data?.objects ?? [];
    const selected = picked ?? list[0]?.folder ?? null;

    if (objects.error) {
        return <p className="p-8 text-bad">Server nicht erreichbar: {objects.error.message}</p>;
    }

    return (
        <div>
            <OrgHeader
                configured={configured}
                sourceAlias={objects.data?.sourceAlias ?? ''}
                targetAlias={objects.data?.targetAlias ?? ''}
                running={run.running}
                onChangeOrgs={() => setPickerOpen(true)}
            />
            <OrgPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                current={{
                    source: objects.data?.sourceAlias ?? '',
                    target: objects.data?.targetAlias ?? ''
                }}
            />
            <main className="mx-auto grid max-w-[1600px] grid-cols-1 items-start gap-6 px-8 pt-6 pb-12 max-sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                <Panel label="Objekte">
                    <h2 className="px-4 pt-4 pb-2 text-xs font-bold text-digital-blue">OBJEKTE</h2>
                    <ObjectList
                        objects={list}
                        selected={selected}
                        disabled={run.running}
                        onSelect={setPicked}
                    />
                </Panel>

                <Panel label="Objekt-Details">
                    {selected && (
                        <DetailPanel
                            key={selected}
                            folder={selected}
                            running={run.running}
                            toolbar={
                                <RunToolbar
                                    mode={mode}
                                    onModeChange={setMode}
                                    targetAlias={objects.data?.targetAlias ?? ''}
                                    selected={selected}
                                    orgs={orgs.data}
                                    running={run.running}
                                    onStart={() => void run.start(selected, mode)}
                                    onStop={run.stop}
                                />
                            }
                        />
                    )}
                </Panel>

                <Terminal log={run.log} running={run.running} onClear={run.clearLog} />
            </main>
        </div>
    );
}
