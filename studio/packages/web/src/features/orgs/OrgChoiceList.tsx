import type { AvailableOrg } from '@studio/shared';
import { disabledReason, isConnected, orgLabel, orgType } from './orgChoice';

interface Props {
    role: 'source' | 'target';
    title: string;
    orgs: AvailableOrg[];
    value: string | null;
    onChange: (alias: string) => void;
}

export function OrgChoiceList({ role, title, orgs, value, onChange }: Props) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-bold text-digital-blue">{title}</legend>
            <ul className="m-0 max-h-72 list-none overflow-auto rounded-xl border border-grey-line p-1">
                {orgs.map((o) => {
                    const reason = disabledReason(o, role);
                    const selected = !!o.alias && o.alias === value;
                    return (
                        <li key={o.username}>
                            <label
                                title={reason ?? undefined}
                                className={`flex items-start gap-2 rounded-lg px-3 py-2 ${reason ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-grey-100'} ${selected ? 'bg-grey-100' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name={`org-${role}`}
                                    className="mt-1"
                                    disabled={!!reason}
                                    checked={selected}
                                    onChange={() => o.alias && onChange(o.alias)}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">
                                        {orgLabel(o)}
                                    </span>
                                    <span className="block truncate text-xs text-grey-500">
                                        {o.username}
                                    </span>
                                    <span className="block truncate text-xs text-grey-500">
                                        {orgType(o)} · …{o.orgId.slice(-4)}
                                        {!isConnected(o) && (
                                            <span className="ml-1 text-bad">· {o.status}</span>
                                        )}
                                    </span>
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </fieldset>
    );
}
