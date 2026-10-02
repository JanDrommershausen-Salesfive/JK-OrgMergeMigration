import type { AvailableOrg } from '@studio/shared';
import { useState } from 'react';
import { useAvailableOrgs, useSelectOrgs } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { NewOrgLogin } from './NewOrgLogin';
import { OrgChoiceList } from './OrgChoiceList';
import { orgLabel, orgType } from './orgChoice';

interface Props {
    open: boolean;
    onClose: () => void;
    current: { source: string; target: string };
}

function Summary({ role, org }: { role: string; org: AvailableOrg }) {
    return (
        <div className="min-w-0 rounded-xl border border-grey-line p-3">
            <div className="text-xs font-bold text-digital-blue">{role}</div>
            <div className="text-lg tracking-tighter">{orgLabel(org)}</div>
            <div className="text-[13px] text-grey-500">{orgType(org)}</div>
            <div className="font-mono text-xs break-all text-grey-500">{org.orgId}</div>
            <div className="text-xs break-all text-grey-500">{org.instanceUrl}</div>
        </div>
    );
}

// Zwei Schritte: wählen, dann bestätigen. Erst die Bestätigung pinnt die Org-IDs.
export function OrgPicker({ open, onClose, current }: Props) {
    const available = useAvailableOrgs(open);
    const select = useSelectOrgs();
    const [source, setSource] = useState<string | null>(current.source || null);
    const [target, setTarget] = useState<string | null>(current.target || null);
    const [confirming, setConfirming] = useState(false);

    const orgs = available.data?.orgs ?? [];
    const byAlias = (alias: string | null) => orgs.find((o) => o.alias === alias);
    const src = byAlias(source);
    const tgt = byAlias(target);
    const problem =
        src && tgt && src.orgId === tgt.orgId ? 'Quelle und Ziel sind dieselbe Org.' : null;
    const close = () => {
        setConfirming(false);
        select.reset();
        onClose();
    };

    return (
        <Dialog open={open} title="Quelle und Ziel auswählen" onClose={close}>
            {available.isPending && <p className="text-grey-500">Lade angemeldete Orgs …</p>}
            {available.error && <p className="text-bad">{available.error.message}</p>}

            {!confirming && !available.isPending && (
                <>
                    <div className="grid gap-4 md:grid-cols-2">
                        <OrgChoiceList
                            role="source"
                            title="QUELLE"
                            orgs={orgs}
                            value={source}
                            onChange={setSource}
                        />
                        <OrgChoiceList
                            role="target"
                            title="ZIEL"
                            orgs={orgs}
                            value={target}
                            onChange={setTarget}
                        />
                    </div>
                    <NewOrgLogin />
                    {problem && <p className="mt-3 text-[13px] text-bad">{problem}</p>}
                    <div className="mt-5 flex justify-end gap-3">
                        <Button variant="ghost" onClick={close}>
                            Abbrechen
                        </Button>
                        <Button
                            disabled={!src || !tgt || !!problem}
                            onClick={() => setConfirming(true)}
                        >
                            Weiter
                        </Button>
                    </div>
                </>
            )}

            {confirming && src && tgt && (
                <>
                    <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
                        <Summary role="QUELLE" org={src} />
                        <span
                            className="justify-self-center text-2xl text-digital-blue"
                            aria-hidden="true"
                        >
                            →
                        </span>
                        <Summary role="ZIEL" org={tgt} />
                    </div>
                    <p className="mt-4 text-[13px] text-grey-500">
                        Mit „Festlegen“ werden die Org-IDs in{' '}
                        <span className="font-mono">migration.project.json</span> gespeichert. Läufe
                        stoppen künftig, wenn ein Alias auf eine andere Org zeigt.
                        {!src.isSandbox && ' Die Produktivquelle wird als Ziel gesperrt.'}
                    </p>
                    {select.isError && (
                        <p role="alert" className="mt-3 text-[13px] text-bad">
                            {select.error.message}
                        </p>
                    )}
                    <div className="mt-5 flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirming(false)}
                            disabled={select.isPending}
                        >
                            Zurück
                        </Button>
                        <Button
                            disabled={select.isPending}
                            onClick={() =>
                                select.mutate(
                                    {
                                        sourceAlias: source as string,
                                        targetAlias: target as string
                                    },
                                    { onSuccess: close }
                                )
                            }
                        >
                            {select.isPending ? 'Prüfe Verbindung …' : 'Festlegen'}
                        </Button>
                    </div>
                </>
            )}
        </Dialog>
    );
}
