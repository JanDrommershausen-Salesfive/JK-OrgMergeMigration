import type { DescribedField, FieldInfo } from '@studio/shared';
import { TYPE_NAMES, typeEmoji } from '../query/fieldType';
import { uncoveredTargetFields } from './coverage';

// Die längere Liste im Mapping: Zielfelder ohne Quelle. Pflichtfelder sind hervorgehoben,
// weil das Ziel den Datensatz ohne sie nicht anlegt.
export function UncoveredTargetFields({
    fields,
    target
}: {
    fields: FieldInfo[];
    target: Record<string, DescribedField>;
}) {
    const rows = uncoveredTargetFields(fields, target);
    const required = rows.filter((r) => r.field.required);
    if (!rows.length) return null;

    return (
        <details
            open={required.length > 0}
            className="mt-4 rounded-xl border border-grey-line px-4 py-3"
        >
            <summary className="cursor-pointer text-sm font-bold">
                Zielfelder ohne Quelle ({rows.length})
                {required.length > 0 && (
                    <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">
                        {required.length} Pflicht
                    </span>
                )}
            </summary>
            <p className="mt-2 mb-2 text-[13px] text-grey-500">
                Diese Zielfelder befüllt der Lauf nicht.{' '}
                {required.length > 0
                    ? 'Pflichtfelder braucht das Ziel zum Anlegen: nimm ein Quellfeld in die Query auf und mappe es hierher.'
                    : 'Kein Pflichtfeld darunter.'}
            </p>
            <ul className="m-0 max-h-72 list-none overflow-auto p-0">
                {rows.map(({ name, field }) => {
                    const emoji = typeEmoji(field.baseType);
                    return (
                        <li key={name} className="flex items-center gap-2 px-1 py-1 text-sm">
                            <span
                                title={`${TYPE_NAMES[emoji] ?? ''} · ${field.type}`}
                                aria-hidden="true"
                            >
                                {emoji}
                            </span>
                            <span className="font-mono text-[13px]">{name}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-grey-500">
                                {field.label}
                            </span>
                            {field.required && (
                                <span className="rounded-full bg-warn-soft px-2 text-xs text-warn">
                                    Pflicht
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}
