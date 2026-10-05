import type { CleanPlan } from '@studio/shared';
import { Tag } from '../../components/ui';
import type { StepState } from './useCleaner';

const th = 'px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-t border-grey-100 px-3 py-2 text-sm';

const STATE: Record<StepState['state'], { text: string; tone: 'plain' | 'ok' | 'warn' | 'bad' }> = {
    running: { text: 'läuft …', tone: 'warn' },
    done: { text: '✓ gelöscht', tone: 'ok' },
    partial: { text: 'teilweise', tone: 'warn' },
    failed: { text: '✕ nicht löschbar', tone: 'bad' },
    skipped: { text: 'nichts zu tun', tone: 'plain' }
};

interface Props {
    plan: CleanPlan;
    live?: Record<number, StepState>; // Zustand je Schritt während oder nach dem Löschen
}

export function PlanTable({ plan, live = {} }: Props) {
    return (
        <div>
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className={th}>Reihenfolge</th>
                        <th className={th}>Objekt</th>
                        <th className={`${th} text-right`}>Datensätze</th>
                        <th className={th}>Grund</th>
                        <th className={th}>Zustand</th>
                    </tr>
                </thead>
                <tbody>
                    {plan.steps.map((s) => {
                        const state = live[s.order];
                        return (
                            <tr key={s.order} className={s.count === 0 ? 'text-grey-500' : ''}>
                                <td className={td}>{s.order}</td>
                                <td className={td}>
                                    <b>{s.label}</b>
                                    {s.object !== s.label && (
                                        <span className="ml-1 text-xs text-grey-500">
                                            ({s.object})
                                        </span>
                                    )}
                                    {s.reason === 'blocker' && (
                                        <span className="ml-2">
                                            <Tag tone="warn">Blocker</Tag>
                                        </span>
                                    )}
                                </td>
                                <td className={`${td} text-right`}>{s.count ?? '–'}</td>
                                <td className={`${td} text-[13px] text-grey-500`}>
                                    {s.note ?? ''}
                                </td>
                                <td className={td}>
                                    {state && (
                                        <span>
                                            <Tag tone={STATE[state.state].tone}>
                                                {STATE[state.state].text}
                                            </Tag>
                                            {state.deleted > 0 && (
                                                <span className="ml-2 text-[13px]">
                                                    {state.deleted} gelöscht
                                                </span>
                                            )}
                                            {state.remaining ? (
                                                <span className="ml-2 text-[13px] text-warn">
                                                    {state.remaining} übrig
                                                </span>
                                            ) : null}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="mt-3 text-sm">
                Zusammen <b>{plan.total}</b> Datensätze in {plan.alias}.
            </p>
            {plan.warnings.length > 0 && (
                <ul role="alert" className="mt-2 list-disc pl-5 text-[13px] text-warn">
                    {plan.warnings.map((w) => (
                        <li key={w}>{w}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
