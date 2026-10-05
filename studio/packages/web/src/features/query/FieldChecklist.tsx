import type { DescribedField } from '@studio/shared';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { TYPE_NAMES, typeEmoji } from './fieldType';

interface Props {
    fields: Record<string, DescribedField>; // Felder der Quelle: nur was die Quelle liefern kann
    selected: string[]; // Felder, die in der Query stehen
    locked: Record<string, string>; // Feld → Grund, warum es nicht abwählbar ist
    disabled: boolean;
    onChange: (add: string[], remove: string[]) => void;
}

interface Row {
    name: string;
    field: DescribedField | undefined;
    checked: boolean;
    info: string[];
    changeable: boolean;
}

// Zusammengesetzte oder binäre Felder lassen sich nicht einzeln in die Query aufnehmen.
const NOT_LISTED = new Set(['address', 'location', 'base64']);

function buildRows({
    fields,
    selected,
    locked
}: Pick<Props, 'fields' | 'selected' | 'locked'>): Row[] {
    const have = new Set(selected.map((s) => s.toLowerCase()));
    const rows: Row[] = Object.entries(fields)
        .filter(([name, f]) => !NOT_LISTED.has(f.baseType) || have.has(name.toLowerCase()))
        .map(([name, field]) => ({
            name,
            field,
            checked: have.has(name.toLowerCase()),
            info: locked[name] ? [locked[name] as string] : [],
            changeable: !locked[name]
        }));
    // In der Query, aber nicht in der Quelle: bleibt sichtbar und lässt sich abwählen.
    const listed = new Set(rows.map((r) => r.name.toLowerCase()));
    for (const name of selected) {
        if (listed.has(name.toLowerCase())) continue;
        rows.push({
            name,
            field: undefined,
            checked: true,
            info: [locked[name] ?? 'nicht in der Quelle vorhanden'],
            changeable: !locked[name]
        });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const th =
    'sticky top-0 z-[1] border-b border-grey-line bg-white px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-b border-grey-100 px-3 py-1.5 align-middle text-sm';

// Tabelle der Quellfelder: Auswahl, Typ, API-Name, Label, Info. Wohin ein Feld im Ziel geht, klärt das Mapping.
export function FieldChecklist(props: Props) {
    const { disabled, onChange } = props;
    const [search, setSearch] = useState('');
    const [onlySelected, setOnlySelected] = useState(false);
    const rows = buildRows(props);
    const q = search.trim().toLowerCase();
    const shown = rows.filter(
        (r) =>
            (!onlySelected || r.checked) &&
            (!q || r.name.toLowerCase().includes(q) || r.field?.label.toLowerCase().includes(q))
    );
    const changeable = shown.filter((r) => r.changeable);
    const checkedCount = rows.filter((r) => r.checked).length;
    const toggle = (r: Row) =>
        !disabled && r.changeable && (r.checked ? onChange([], [r.name]) : onChange([r.name], []));

    return (
        <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Feld suchen …"
                    aria-label="Felder durchsuchen"
                    className="w-60 rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm"
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="checkbox"
                        checked={onlySelected}
                        onChange={(e) => setOnlySelected(e.target.checked)}
                    />{' '}
                    nur ausgewählte
                </label>
                <span className="flex-1" />
                <span className="text-[13px] text-grey-500">
                    {checkedCount} von {rows.length} ausgewählt
                </span>
                <Button
                    variant="ghost"
                    small
                    disabled={disabled || !changeable.some((r) => !r.checked)}
                    onClick={() =>
                        onChange(
                            changeable.filter((r) => !r.checked).map((r) => r.name),
                            []
                        )
                    }
                >
                    Alle sichtbaren
                </Button>
                <Button
                    variant="ghost"
                    small
                    disabled={disabled || !changeable.some((r) => r.checked)}
                    onClick={() =>
                        onChange(
                            [],
                            changeable.filter((r) => r.checked).map((r) => r.name)
                        )
                    }
                >
                    Keine sichtbaren
                </Button>
            </div>
            <div className="max-h-96 overflow-auto rounded-xl border border-grey-line">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className={`${th} w-16`}>Auswahl</th>
                            <th className={th}>Typ</th>
                            <th className={th}>API-Name</th>
                            <th className={th}>Label</th>
                            <th className={th}>Info</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r) => {
                            const emoji = typeEmoji(r.field?.baseType);
                            return (
                                <tr
                                    key={r.name}
                                    onClick={() => toggle(r)}
                                    className={
                                        r.changeable && !disabled
                                            ? 'cursor-pointer hover:bg-grey-100'
                                            : ''
                                    }
                                >
                                    <td className={`${td} text-center`}>
                                        <input
                                            type="checkbox"
                                            checked={r.checked}
                                            disabled={disabled || !r.changeable}
                                            aria-label={r.name}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => toggle(r)}
                                        />
                                    </td>
                                    <td
                                        className={`${td} whitespace-nowrap`}
                                        title={TYPE_NAMES[emoji]}
                                    >
                                        <span aria-hidden="true">{emoji}</span>{' '}
                                        <span className="text-xs text-grey-500">
                                            {r.field?.type ?? ''}
                                        </span>
                                    </td>
                                    <td
                                        className={`${td} font-mono text-[13px] ${r.checked ? '' : 'text-grey-500'}`}
                                    >
                                        {r.name}
                                    </td>
                                    <td className={`${td} text-grey-500`}>{r.field?.label}</td>
                                    <td
                                        className={`${td} text-xs ${r.field ? 'text-grey-500' : 'text-warn'}`}
                                    >
                                        {r.info.join(' · ')}
                                    </td>
                                </tr>
                            );
                        })}
                        {!shown.length && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-sm text-grey-500">
                                    Keine passenden Felder.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
