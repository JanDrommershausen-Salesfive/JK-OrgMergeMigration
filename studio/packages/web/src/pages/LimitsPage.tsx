import type { LimitLevel, OrgLimit, OrgLimits } from '@studio/shared';
import { Link } from 'react-router';
import { useOrgLimits } from '../api/queries';
import { Button } from '../components/ui';

const BAR: Record<LimitLevel, string> = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-bad' };
const LABEL: Record<LimitLevel, string> = { ok: '', warn: 'knapp', crit: 'fast erschöpft' };
const num = (n: number) => n.toLocaleString('de-DE');

function LimitRow({ l }: { l: OrgLimit }) {
    return (
        <li className="mb-4 last:mb-0">
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-bold">{l.label}</span>
                {l.level !== 'ok' && (
                    <span
                        className={`rounded-full px-2 text-xs font-bold text-white ${BAR[l.level]}`}
                    >
                        {LABEL[l.level]}
                    </span>
                )}
                <span className="flex-1" />
                <span className="text-[13px]">
                    {num(l.used)} von {num(l.max)} {l.unit} ({l.percentUsed.toLocaleString('de-DE')}{' '}
                    %)
                </span>
            </div>
            <div
                role="progressbar"
                aria-label={l.label}
                aria-valuenow={l.percentUsed}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 overflow-hidden rounded-full bg-grey-100"
            >
                <div
                    className={`h-full ${BAR[l.level]}`}
                    style={{
                        width: `${Math.max(Math.min(l.percentUsed, 100), l.used > 0 ? 1 : 0)}%`
                    }}
                />
            </div>
            <p className="mt-1 mb-0 text-xs text-grey-500">
                Frei: {num(l.remaining)} {l.unit}. {l.hint}
            </p>
        </li>
    );
}

function OrgCard({ org }: { org: OrgLimits }) {
    return (
        <section
            aria-label={org.role === 'source' ? 'Quelle' : 'Ziel'}
            className="rounded-xl border border-grey-line bg-white p-5"
        >
            <h3 className="mb-3 text-xs font-bold text-digital-blue">
                {org.role === 'source' ? 'QUELLE' : 'ZIEL'} ·{' '}
                <span className="text-base text-ink">{org.alias}</span>
            </h3>
            {org.error ? (
                <p role="alert" className="text-sm text-bad">
                    {org.error}
                </p>
            ) : (
                <ul className="m-0 list-none p-0">
                    {org.limits.map((l) => (
                        <LimitRow key={l.key} l={l} />
                    ))}
                </ul>
            )}
        </section>
    );
}

// Org-Limits von Quelle und Ziel, die für Migration und Löschen eine Rolle spielen. Kostet einen API-Aufruf je Org.
export function LimitsPage() {
    const limits = useOrgLimits();
    const tight = (limits.data?.orgs ?? []).flatMap((o) =>
        o.limits.filter((l) => l.level !== 'ok').map((l) => `${l.label} in ${o.alias}`)
    );

    return (
        <>
            <p className="mb-2 text-[13px]">
                <Link className="text-digital-blue underline" to="/tools">
                    ← Tools
                </Link>
            </p>
            <div className="mb-1 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-normal tracking-tighter">Org-Limits</h2>
                <Button
                    variant="ghost"
                    small
                    disabled={limits.isFetching}
                    onClick={() => void limits.refetch()}
                >
                    {limits.isFetching ? 'Lese …' : 'Aktualisieren'}
                </Button>
                {limits.data && (
                    <span className="text-[13px] text-grey-500">
                        Stand {new Date(limits.data.checkedAt).toLocaleTimeString('de-DE')}
                    </span>
                )}
            </div>
            <p className="mb-4 text-[13px] text-grey-500">
                Grenzen, gegen die Migration und Löschen laufen. Gelesen mit{' '}
                <span className="font-mono">sf limits api display</span>, ein API-Aufruf je Org.
            </p>
            {tight.length > 0 && (
                <p
                    role="alert"
                    className="mb-4 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm text-warn"
                >
                    Knapp oder fast erschöpft: {tight.join(', ')}.
                </p>
            )}
            {limits.isPending && <p className="text-grey-500">Lese Limits …</p>}
            {limits.error && (
                <p role="alert" className="text-bad">
                    {limits.error.message}
                </p>
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {(limits.data?.orgs ?? []).map((o) => (
                    <OrgCard key={o.role} org={o} />
                ))}
            </div>
        </>
    );
}
