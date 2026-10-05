import type { CleanPlanRequest } from '@studio/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import {
    useCleanerPlan,
    useCleanerRules,
    useCleanerStatus,
    useObjects,
    useOrgs
} from '../api/queries';
import { Button, Panel } from '../components/ui';
import { CleanerForm, type CleanerFormState } from '../features/cleaner/CleanerForm';
import { ConfirmCleanDialog } from '../features/cleaner/ConfirmCleanDialog';
import { PlanTable } from '../features/cleaner/PlanTable';
import { useCleanerStream } from '../features/cleaner/useCleaner';
import { useRunContext } from '../features/run/RunContext';

const toRequest = (f: CleanerFormState): CleanPlanRequest => ({
    objects: f.objects,
    scope: { creator: f.creator, since: f.since || null },
    includeBlockers: f.includeBlockers,
    blockersAnyCreator: f.includeBlockers && f.blockersAnyCreator
});

// Org Cleaner: leert die Ziel-Sandbox für den nächsten Testlauf (laden, löschen, laden, löschen).
export function OrgCleanerPage() {
    const objects = useObjects();
    const configured = objects.data?.configured ?? false;
    const orgs = useOrgs(configured);
    const rules = useCleanerRules();
    const status = useCleanerStatus();
    const run = useRunContext();
    const stream = useCleanerStream();
    const planner = useCleanerPlan();

    const [form, setForm] = useState<CleanerFormState>({
        creator: 'me',
        since: '',
        includeBlockers: true,
        blockersAnyCreator: false,
        objects: []
    });
    const [planKey, setPlanKey] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const initialised = useRef(false);

    const list = objects.data?.objects ?? [];
    const target = orgs.data?.target;
    const alias = objects.data?.targetAlias ?? '';
    const sandbox = target?.connected ? target.isSandbox : null;
    const cleanerRunning = status.data?.running ?? false;
    const busy = cleanerRunning || run.running;

    // Voreinstellung einmal aus den Objekten und den Projektregeln.
    useEffect(() => {
        if (initialised.current || !objects.data || !rules.data) return;
        initialised.current = true;
        const excluded = new Set(rules.data.exclude);
        setForm((f) => ({
            ...f,
            creator: rules.data.defaultScope?.creator ?? 'me',
            since: rules.data.defaultScope?.since ?? '',
            objects: objects.data.objects.map((o) => o.object).filter((o) => !excluded.has(o))
        }));
    }, [objects.data, rules.data]);

    const request = toRequest(form);
    const current = JSON.stringify(request);
    const plan = planner.data && planKey === current ? planner.data : null;
    const hasEnded = stream.end !== null;

    if (objects.isPending) return <p className="text-grey-500">Lade …</p>;
    if (!configured) {
        return (
            <Panel label="Org Cleaner">
                <p className="p-8 text-center text-grey-500">
                    Wähle zuerst Quelle und Ziel aus (oben „Orgs auswählen“).
                </p>
            </Panel>
        );
    }

    const start = (hardDelete: boolean) => {
        setStarting(true);
        setStartError(null);
        api.cleanerStart({ ...request, confirm: alias, hardDelete })
            .then(() => {
                setConfirmOpen(false);
                stream.reconnect();
                void status.refetch();
            })
            .catch((e: Error) => setStartError(e.message))
            .finally(() => setStarting(false));
    };

    return (
        <>
            <p className="mb-2 text-[13px]">
                <Link className="text-digital-blue underline" to="/tools">
                    ← Tools
                </Link>
            </p>
            <h2 className="mb-1 text-xl font-normal tracking-tighter">Org Cleaner</h2>
            <p className="mb-4 text-[13px] text-grey-500">
                Leert die Ziel-Org <b>{alias}</b>, damit ein Testlauf schnell neu starten kann.
                Gelöscht wird in der Reihenfolge Kinder vor Eltern; Objekte, die das Löschen anderer
                blockieren, kommen automatisch dazu. Es wird nur in der Ziel-Org gelöscht, nie in
                der Quelle.
            </p>
            {sandbox === false && (
                <p
                    role="alert"
                    className="mb-4 rounded-xl border border-bad bg-bad-soft px-4 py-3 text-sm text-bad"
                >
                    {alias} ist keine Sandbox. Der Cleaner löscht nur in Sandboxes und ist hier
                    gesperrt.
                </p>
            )}
            {busy && (
                <p
                    role="status"
                    className="mb-4 rounded-xl border border-digital-blue bg-white px-4 py-3 text-sm"
                >
                    {cleanerRunning
                        ? 'Ein Löschauftrag läuft.'
                        : 'Ein Migrationslauf läuft, solange kann nicht gelöscht werden.'}
                </p>
            )}

            <div className="space-y-6">
                <Panel label="Umfang">
                    <div className="p-5">
                        <h3 className="mb-3 text-sm font-bold text-digital-blue">1 · UMFANG</h3>
                        <CleanerForm
                            state={form}
                            onChange={setForm}
                            objects={list.map((o) => ({ folder: o.folder, object: o.object }))}
                            rules={rules.data}
                            username={target?.connected ? (target.username ?? '') : ''}
                            alias={alias}
                            disabled={busy || sandbox === false}
                            planning={planner.isPending}
                            onPlan={() =>
                                planner.mutate(request, { onSuccess: () => setPlanKey(current) })
                            }
                        />
                        {planner.error && (
                            <p role="alert" className="mt-3 text-[13px] text-bad">
                                {planner.error.message}
                            </p>
                        )}
                    </div>
                </Panel>

                {plan && (
                    <Panel label="Plan">
                        <div className="p-5">
                            <h3 className="mb-3 text-sm font-bold text-digital-blue">2 · PLAN</h3>
                            <PlanTable plan={plan} live={stream.steps} />
                            <div className="mt-4">
                                <Button
                                    variant="danger"
                                    disabled={busy || sandbox === false || plan.total === 0}
                                    onClick={() => setConfirmOpen(true)}
                                >
                                    Löschen starten …
                                </Button>
                                {plan.total === 0 && (
                                    <span className="ml-3 text-[13px] text-grey-500">
                                        Nichts zu löschen.
                                    </span>
                                )}
                            </div>
                        </div>
                    </Panel>
                )}

                {(cleanerRunning || hasEnded || stream.log) && (
                    <Panel label="Fortschritt">
                        <div className="p-5">
                            <div className="mb-3 flex items-center gap-3">
                                <h3 className="text-sm font-bold text-digital-blue">
                                    3 · FORTSCHRITT
                                </h3>
                                {cleanerRunning && (
                                    <Button
                                        variant="ghost"
                                        small
                                        onClick={() => void api.cleanerStop()}
                                    >
                                        Anhalten
                                    </Button>
                                )}
                            </div>
                            {stream.end && (
                                <p
                                    role="status"
                                    className={`mb-3 rounded-lg px-3 py-2 text-sm ${stream.end.ok ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}
                                >
                                    {stream.end.stopped
                                        ? 'Angehalten. '
                                        : stream.end.ok
                                          ? 'Fertig. '
                                          : 'Mit Resten beendet. '}
                                    {stream.end.deleted} gelöscht
                                    {stream.end.failed
                                        ? `, ${stream.end.failed} nicht löschbar (Gründe im Protokoll)`
                                        : ''}
                                    .
                                </p>
                            )}
                            <pre className="m-0 max-h-80 overflow-auto rounded-xl bg-[#0b0f19] p-4 font-mono text-[12.5px] whitespace-pre-wrap text-[#d5dde8]">
                                {stream.log || 'Warte auf Ausgabe …'}
                            </pre>
                        </div>
                    </Panel>
                )}
            </div>

            <ConfirmCleanDialog
                open={confirmOpen}
                alias={alias}
                total={plan?.total ?? 0}
                creator={form.creator}
                pending={starting}
                error={startError}
                onClose={() => setConfirmOpen(false)}
                onConfirm={start}
            />
        </>
    );
}
