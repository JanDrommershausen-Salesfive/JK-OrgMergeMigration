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
import { LiveSteps } from '../features/cleaner/LiveSteps';
import { PlanTable } from '../features/cleaner/PlanTable';
import { Path, stageGuidance, type Phase } from '../features/cleaner/Stepper';
import { useCleanerStream } from '../features/cleaner/useCleaner';
import { useRunContext } from '../features/run/RunContext';

const EMPTY: CleanerFormState = {
    creator: 'me',
    since: '',
    includeBlockers: true,
    blockersAnyCreator: false,
    objects: []
};

const toRequest = (f: CleanerFormState): CleanPlanRequest => ({
    objects: f.objects,
    scope: { creator: f.creator, since: f.since || null },
    includeBlockers: f.includeBlockers,
    blockersAnyCreator: f.includeBlockers && f.blockersAnyCreator
});

// Org Cleaner: leert die Ziel-Sandbox für den nächsten Testlauf (laden, löschen, laden, löschen).
// Ein Löschlauf ist ein Ablauf mit festen Schritten: Umfang → Plan → Löschen. Während und nach dem Löschen
// ist nur der Lauf zu sehen; "Neuer Löschlauf" setzt zurück und öffnet wieder den Umfang.
export function OrgCleanerPage() {
    const objects = useObjects();
    const configured = objects.data?.configured ?? false;
    const orgs = useOrgs(configured);
    const rules = useCleanerRules();
    const status = useCleanerStatus();
    const run = useRunContext();
    const stream = useCleanerStream();
    const planner = useCleanerPlan();

    const [form, setForm] = useState<CleanerFormState>(EMPTY);
    const [planKey, setPlanKey] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [started, setStarted] = useState<string | null>(null); // Kurzbeschreibung des gestarteten Laufs
    const [resetError, setResetError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false); // im Plan-Schritt zurück zur Konfiguration gegangen
    const initialised = useRef(false);

    const list = objects.data?.objects ?? [];
    const target = orgs.data?.target;
    const alias = objects.data?.targetAlias ?? '';
    const sandbox = target?.connected ? target.isSandbox : null;
    const cleanerRunning = status.data?.running ?? false;
    const migrationRunning = run.running;

    const defaults = (): CleanerFormState => {
        const excluded = new Set(rules.data?.exclude ?? []);
        return {
            creator: rules.data?.defaultScope?.creator ?? 'me',
            since: rules.data?.defaultScope?.since ?? '',
            includeBlockers: true,
            blockersAnyCreator: false,
            objects: list.map((o) => o.object).filter((o) => !excluded.has(o))
        };
    };

    // Voreinstellung einmal aus den Objekten und den Projektregeln.
    useEffect(() => {
        if (initialised.current || !objects.data || !rules.data) return;
        initialised.current = true;
        setForm(defaults());
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal, wenn die Daten da sind
    }, [objects.data, rules.data]);

    const request = toRequest(form);
    const current = JSON.stringify(request);
    const plan = planner.data && planKey === current ? planner.data : null;
    const hasRun = stream.end !== null || Object.keys(stream.steps).length > 0 || stream.log !== '';
    const phase: Phase = cleanerRunning
        ? 'running'
        : hasRun
          ? 'finished'
          : plan && !editing
            ? 'planned'
            : 'setup';

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
                setStarted(
                    `${form.creator === 'me' ? 'Von mir angelegte Datensätze' : 'Alle Datensätze'}${form.since ? ` seit ${form.since}` : ''}, ${form.objects.length} Objekte, ${plan?.total ?? 0} Datensätze laut Plan`
                );
                setConfirmOpen(false);
                stream.reconnect();
                void status.refetch();
            })
            .catch((e: Error) => setStartError(e.message))
            .finally(() => setStarting(false));
    };

    // Ergebnisse (auch serverseitig) verwerfen und zurück zum Umfang; die Auswahl bleibt für den nächsten Lauf erhalten.
    const newRun = () => {
        setResetError(null);
        api.cleanerReset()
            .then(() => {
                planner.reset();
                setPlanKey('');
                setEditing(false);
                setStarted(null);
                stream.reconnect();
                void status.refetch();
            })
            .catch((e: Error) => setResetError(e.message));
    };

    const blocked = migrationRunning || sandbox === false;

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
            {migrationRunning && phase !== 'running' && (
                <p
                    role="status"
                    className="mb-4 rounded-xl border border-digital-blue bg-white px-4 py-3 text-sm"
                >
                    Ein Migrationslauf läuft, solange kann nicht gelöscht werden.
                </p>
            )}

            <Panel label="Löschlauf">
                <div className="px-5 pt-5">
                    <Path phase={phase} onBackToConfig={() => setEditing(true)} />
                    <p className="mt-4 mb-0 border-b border-grey-line pb-4 text-[13px] text-grey-500">
                        {stageGuidance(phase)}
                    </p>
                </div>
                <div className="p-5">
                    {phase === 'setup' && (
                        <>
                            <div className="mb-3 flex items-center gap-3">
                                <h3 className="text-sm font-bold text-digital-blue">
                                    KONFIGURATION
                                </h3>
                                <button
                                    type="button"
                                    className="cursor-pointer text-[13px] text-digital-blue underline"
                                    onClick={() => {
                                        setForm(defaults());
                                        planner.reset();
                                        setPlanKey('');
                                        setEditing(false);
                                    }}
                                >
                                    Zurücksetzen
                                </button>
                            </div>
                            <CleanerForm
                                state={form}
                                onChange={setForm}
                                objects={list.map((o) => ({ folder: o.folder, object: o.object }))}
                                rules={rules.data}
                                username={target?.connected ? (target.username ?? '') : ''}
                                alias={alias}
                                disabled={blocked}
                                planning={planner.isPending}
                                onPlan={() =>
                                    planner.mutate(request, {
                                        onSuccess: () => {
                                            setPlanKey(current);
                                            setEditing(false);
                                        }
                                    })
                                }
                            />
                            {planner.error && (
                                <p role="alert" className="mt-3 text-[13px] text-bad">
                                    {planner.error.message}
                                </p>
                            )}
                        </>
                    )}

                    {phase === 'planned' && plan && (
                        <>
                            <h3 className="mb-3 text-sm font-bold text-digital-blue">PLAN</h3>
                            <PlanTable plan={plan} />
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Button
                                    variant="danger"
                                    disabled={blocked || plan.total === 0}
                                    onClick={() => setConfirmOpen(true)}
                                >
                                    Löschen starten …
                                </Button>
                                <Button variant="ghost" onClick={() => setEditing(true)}>
                                    Konfiguration ändern
                                </Button>
                                {plan.total === 0 && (
                                    <span className="text-[13px] text-grey-500">
                                        Nichts zu löschen.
                                    </span>
                                )}
                            </div>
                        </>
                    )}

                    {(phase === 'running' || phase === 'finished') && (
                        <>
                            <div className="mb-3 flex flex-wrap items-center gap-3">
                                <h3 className="text-sm font-bold text-digital-blue">
                                    {phase === 'running' ? 'LÖSCHEN' : 'ERGEBNIS'}
                                </h3>
                                {started && (
                                    <span className="text-[13px] text-grey-500">{started}</span>
                                )}
                                <span className="flex-1" />
                                {phase === 'running' ? (
                                    <Button
                                        variant="ghost"
                                        small
                                        onClick={() => void api.cleanerStop()}
                                    >
                                        Anhalten
                                    </Button>
                                ) : (
                                    <Button onClick={newRun}>Neuer Löschlauf</Button>
                                )}
                            </div>
                            {resetError && (
                                <p role="alert" className="mb-3 text-[13px] text-bad">
                                    {resetError}
                                </p>
                            )}
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
                            <LiveSteps steps={stream.steps} />
                            <pre className="m-0 mt-4 max-h-80 overflow-auto rounded-xl bg-[#0b0f19] p-4 font-mono text-[12.5px] whitespace-pre-wrap text-[#d5dde8]">
                                {stream.log || 'Warte auf Ausgabe …'}
                            </pre>
                        </>
                    )}
                </div>
            </Panel>

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
