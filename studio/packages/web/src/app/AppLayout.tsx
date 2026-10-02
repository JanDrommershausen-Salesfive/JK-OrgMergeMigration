import { useState } from 'react';
import { Outlet } from 'react-router';
import { useObjects } from '../api/queries';
import { MainNav } from '../components/MainNav';
import { Button } from '../components/ui';
import { OrgHeader } from '../features/orgs/OrgHeader';
import { OrgPicker } from '../features/orgs/OrgPicker';
import { RunNotice } from '../features/run/RunNotice';
import { RunProvider, useRunContext } from '../features/run/RunContext';
import { Terminal } from '../features/run/Terminal';

function Shell() {
    const objects = useObjects();
    const run = useRunContext();
    const [pickerOpen, setPickerOpen] = useState(false);
    const configured = objects.data?.configured ?? false;

    if (objects.error) {
        return <p className="p-8 text-bad">Server nicht erreichbar: {objects.error.message}</p>;
    }
    return (
        <div>
            <OrgHeader
                configured={objects.data ? configured : null}
                staleProjectPath={objects.data?.staleProjectPath ?? null}
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
            <MainNav />
            <main className="mx-auto max-w-[1600px] px-8 pt-6 pb-12 max-sm:px-4">
                <RunNotice />
                {objects.data && !configured ? (
                    <div className="rounded-xl border border-grey-line bg-white p-8 text-center">
                        <p className="mb-4 text-grey-500">
                            Für dieses Projekt sind noch keine Orgs festgelegt.
                        </p>
                        <Button onClick={() => setPickerOpen(true)}>Orgs auswählen</Button>
                    </div>
                ) : (
                    <Outlet />
                )}
                <div className="mt-6">
                    <Terminal log={run.log} running={run.running} onClear={run.clearLog} />
                </div>
            </main>
        </div>
    );
}

export function AppLayout() {
    return (
        <RunProvider>
            <Shell />
        </RunProvider>
    );
}
