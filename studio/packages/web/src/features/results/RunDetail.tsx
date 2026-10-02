import type { RunMeta } from '@studio/shared';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useRunDetail, useRunLog } from '../../api/queries';
import { Tag } from '../../components/ui';
import { formatWhen, modeLabel } from './format';
import { ErrorsTable, MissingParentsTable } from './Tables';
import { Tiles, type Section } from './Tiles';

const EXPORT_LINK =
    'rounded-full border border-grey-line px-4 py-1.5 text-sm font-bold text-ink hover:border-ink';
const SECTIONS: Section[] = ['fehler', 'parents', 'warnungen', 'zusammenfassung', 'log'];

// Ohne Auswahl die auffälligste Ansicht zeigen.
function defaultSection(meta: RunMeta): Section {
    if (meta.counts.errors) return 'fehler';
    if (meta.counts.missingParents) return 'parents';
    if (meta.counts.warnings) return 'warnungen';
    return 'zusammenfassung';
}

function Banner({ meta }: { meta: RunMeta }) {
    const note = 'mb-3 rounded-lg px-3 py-2 text-[13px]';
    return (
        <>
            {meta.mode === 'simulation' && (
                <p className={`${note} bg-grey-100 text-ink`}>
                    Simulation: zeigt, was geschrieben würde. Fehler von Salesforce selbst (zum
                    Beispiel Validierungsregeln) treten erst im Live-Lauf auf.
                </p>
            )}
            {!meta.ok && (
                <div role="alert" className={`${note} bg-bad-soft text-bad`}>
                    {meta.stopped
                        ? 'Lauf abgebrochen.'
                        : `Lauf fehlgeschlagen (Exit-Code ${meta.exitCode ?? meta.signal}).`}
                    {meta.logErrors.map((e, i) => (
                        <div key={i} className="font-mono text-xs">
                            {e}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

function Warnings({ meta }: { meta: RunMeta }) {
    const fields = meta.warnings.filter((w) => w.kind === 'missing-field');
    const others = meta.warnings.filter((w) => w.kind !== 'missing-field');
    if (!meta.warnings.length) return <p className="py-4 text-grey-500">Keine Warnungen.</p>;
    return (
        <div className="space-y-4 text-sm">
            {others.length > 0 && (
                <ul className="m-0 list-disc space-y-1 pl-5">
                    {others.map((w) => (
                        <li key={w.message}>
                            {w.message}
                            {w.count > 1 && <Tag>{w.count}×</Tag>}
                        </li>
                    ))}
                </ul>
            )}
            {fields.length > 0 && (
                <div>
                    <p className="mb-1 font-bold">
                        {fields.length} Felder fehlen in der Quelle und werden ausgelassen
                    </p>
                    <p className="font-mono text-[13px] text-grey-500">
                        {fields
                            .map((w) => w.message.match(/\{([^}]+)\}/)?.[1] ?? w.message)
                            .join(', ')}
                    </p>
                </div>
            )}
        </div>
    );
}

function Summary({ meta }: { meta: RunMeta }) {
    return (
        <table className="w-full border-collapse text-sm">
            <thead>
                <tr className="text-left text-xs text-grey-500">
                    <th className="px-3 py-2">Objekt</th>
                    <th className="px-3 py-2">Durchlauf</th>
                    <th className="px-3 py-2 text-right">Eingefügt</th>
                    <th className="px-3 py-2 text-right">Aktualisiert</th>
                    <th className="px-3 py-2 text-right">Gelöscht</th>
                </tr>
            </thead>
            <tbody>
                {meta.summary.flatMap((o) =>
                    o.passes.map((p) => (
                        <tr key={`${o.object}${p.pass}`} className="border-t border-grey-100">
                            <td className="px-3 py-1.5">{p.pass === 1 ? o.object : ''}</td>
                            <td className="px-3 py-1.5 text-grey-500">Pass {p.pass}</td>
                            <td className="px-3 py-1.5 text-right">{p.inserted}</td>
                            <td className="px-3 py-1.5 text-right">{p.updated}</td>
                            <td className="px-3 py-1.5 text-right">{p.deleted}</td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );
}

// Details eines archivierten Laufs. Die Ansicht steht in der URL (?ansicht=fehler), damit Links darauf zeigen können.
export function RunDetail({ folder, id }: { folder: string; id: string }) {
    const detail = useRunDetail(folder, id);
    const [params, setParams] = useSearchParams();
    const asked = params.get('ansicht');
    const d = detail.data;
    const section: Section = SECTIONS.includes(asked as Section)
        ? (asked as Section)
        : d
          ? defaultSection(d.meta)
          : 'zusammenfassung';
    const log = useRunLog(folder, id, section === 'log');
    const select = (s: Section) => setParams({ ansicht: s }, { replace: true });

    if (detail.error)
        return (
            <p role="alert" className="p-6 text-bad">
                {detail.error.message}
            </p>
        );
    if (!d) return <p className="p-6 text-grey-500">Lade …</p>;
    const m = d.meta;

    return (
        <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] leading-tight font-normal tracking-tighter">
                    {m.object}
                </h2>
                <Tag tone={m.mode === 'live' ? 'bad' : 'plain'}>{modeLabel(m.mode)}</Tag>
                {m.cohort && (
                    <Tag tone="map">
                        Kohorte: {m.cohort.name} ({m.cohort.count})
                    </Tag>
                )}
                <span className="text-[13px] text-grey-500">
                    {formatWhen(m.startedAt)} · {m.sourceAlias} → {m.targetAlias}
                </span>
                <span className="flex-1" />
                <Link className={EXPORT_LINK} to={`/konfiguration/${folder}`}>
                    Konfiguration öffnen
                </Link>
            </div>
            <Banner meta={m} />
            <Tiles meta={m} active={section} onSelect={select} />

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold">
                    {
                        {
                            fehler: 'Fehler',
                            parents: 'Fehlende Parents',
                            warnungen: 'Warnungen',
                            zusammenfassung: 'Zusammenfassung',
                            log: 'Log'
                        }[section]
                    }
                </h3>
                <span className="flex-1" />
                {section !== 'log' && (
                    <button
                        type="button"
                        className={`${EXPORT_LINK} cursor-pointer`}
                        onClick={() => select('log')}
                    >
                        Log anzeigen
                    </button>
                )}
                {section === 'fehler' && d.errorsTotal > 0 && (
                    <a className={EXPORT_LINK} href={api.exportUrl(folder, id, 'errors')} download>
                        CSV exportieren
                    </a>
                )}
                {section === 'parents' && d.missingParentsTotal > 0 && (
                    <a
                        className={EXPORT_LINK}
                        href={api.exportUrl(folder, id, 'missing-parents')}
                        download
                    >
                        CSV exportieren
                    </a>
                )}
            </div>
            {section === 'fehler' && <ErrorsTable rows={d.errors} total={d.errorsTotal} />}
            {section === 'parents' && (
                <MissingParentsTable
                    groups={d.missingParentGroups}
                    rows={d.missingParents}
                    total={d.missingParentsTotal}
                />
            )}
            {section === 'warnungen' && <Warnings meta={m} />}
            {section === 'zusammenfassung' && <Summary meta={m} />}
            {section === 'log' && (
                <pre className="m-0 max-h-[60vh] overflow-auto rounded-xl bg-[#0b0f19] p-4 font-mono text-[12.5px] whitespace-pre-wrap text-[#d5dde8]">
                    {log.data?.log ?? 'Lade …'}
                </pre>
            )}
        </div>
    );
}
