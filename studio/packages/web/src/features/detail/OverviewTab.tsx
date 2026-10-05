import { Link } from 'react-router';
import { useDescribe, useQueryModel } from '../../api/queries';
import { Tag } from '../../components/ui';
import type { ObjectDetail } from '@studio/shared';
import { useCurrentVersion } from '../presets/useCurrentVersion';
import { filterCount, mappingReady, mappingSummary, parentsText } from './configSummary';

interface Item {
    key: string;
    title: string;
    to: string;
    state: 'ok' | 'warn' | 'pending';
    lines: string[];
}

const ICON = { ok: '✓', warn: '!', pending: '…' } as const;
const ICON_CLASS = {
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    pending: 'bg-grey-100 text-grey-500'
} as const;

// Übersicht: Stand der drei Konfigurationsteile als Checkliste und die aktive Version.
export function OverviewTab({
    detail,
    onOpenVersions
}: {
    detail: ObjectDetail;
    onOpenVersions: () => void;
}) {
    const folder = detail.folder;
    const query = useQueryModel(folder);
    const describe = useDescribe(folder);
    const version = useCurrentVersion(folder);
    const m = mappingSummary(detail.fields, describe.data);
    const q = query.data;

    const filters = q ? filterCount(q) : 0;
    const queryLines = [
        `${detail.fields.length} Felder`,
        filters ? `${filters} ${filters === 1 ? 'Filter' : 'Filter'}` : 'ohne Filter',
        ...(q && parentsText(q) ? [parentsText(q)] : [])
    ];
    const mappingLines = m
        ? [
              `${m.auto} 1:1, ${m.manual} gemappt${m.excluded ? `, ${m.excluded} ausgeschlossen` : ''}`,
              ...(m.missing ? [`${m.missing} Felder fehlen im Ziel`] : []),
              ...(m.requiredOpen ? [`${m.requiredOpen} Pflichtfelder im Ziel ohne Quelle`] : []),
              ...(m.deviations ? [`${m.deviations} Abweichungen (Typ, schreibbar)`] : [])
          ]
        : [describe.data ? 'Ziel nicht lesbar' : 'Prüfe Felder in Quelle und Ziel …'];
    const items: Item[] = [
        {
            key: 'query',
            title: '1 Query',
            to: `/konfiguration/${folder}/query`,
            state: detail.fields.length ? 'ok' : 'warn',
            lines: queryLines
        },
        {
            key: 'mapping',
            title: '2 Mapping',
            to: `/konfiguration/${folder}/mapping`,
            state: m ? (mappingReady(m) ? 'ok' : 'warn') : 'pending',
            lines: mappingLines
        },
        {
            key: 'werte',
            title: '3 Wertemapping',
            to: `/konfiguration/${folder}/werte`,
            state: 'ok',
            lines: [
                detail.valueMappings.length
                    ? `${detail.valueMappings.length} Regeln`
                    : 'keine nötig'
            ]
        }
    ];

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section
                aria-label="Konfiguration auf einen Blick"
                className="rounded-xl border border-grey-line p-4"
            >
                <h3 className="mb-3 text-sm font-bold">Konfiguration auf einen Blick</h3>
                <ul className="m-0 list-none p-0">
                    {items.map((i) => (
                        <li
                            key={i.key}
                            className="flex items-start gap-3 border-t border-grey-line py-3 first:border-t-0 first:pt-0"
                        >
                            <span
                                aria-hidden="true"
                                className={`grid size-6 flex-none place-items-center rounded-full text-xs font-bold ${ICON_CLASS[i.state]}`}
                            >
                                {ICON[i.state]}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="font-bold">{i.title}</div>
                                <div className="text-[13px] text-grey-500">
                                    {i.lines.join(' · ')}
                                </div>
                            </div>
                            <Link
                                className="text-[13px] font-bold text-digital-blue underline"
                                to={i.to}
                                aria-label={`${i.title} bearbeiten`}
                            >
                                Bearbeiten
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-label="Aktiver Stand" className="rounded-xl border border-grey-line p-4">
                <h3 className="mb-3 text-sm font-bold">Aktiver Stand</h3>
                {version.loading ? (
                    <p className="text-[13px] text-grey-500">Lade …</p>
                ) : version.saved ? (
                    <p className="mb-2">
                        <Tag tone="ok">gespeichert</Tag> <b>{version.name}</b>
                    </p>
                ) : (
                    <p className="mb-2 text-[13px] text-warn">
                        Nicht gespeichert: Der aktuelle Stand entspricht keiner Version.
                    </p>
                )}
                <p className="mb-3 text-[13px] text-grey-500">
                    {version.list.length} gespeicherte{' '}
                    {version.list.length === 1 ? 'Version' : 'Versionen'}.
                </p>
                <button
                    type="button"
                    onClick={onOpenVersions}
                    className="cursor-pointer text-[13px] font-bold text-digital-blue underline"
                >
                    Versionen verwalten
                </button>
            </section>
        </div>
    );
}
