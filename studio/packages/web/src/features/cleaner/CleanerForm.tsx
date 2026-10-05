import type { CleanScope, CleanerRules } from '@studio/shared';
import { Button } from '../../components/ui';

export interface CleanerFormState {
    creator: CleanScope['creator'];
    since: string;
    includeBlockers: boolean;
    blockersAnyCreator: boolean;
    objects: string[]; // abgewählte Objekte fehlen
}

interface Props {
    state: CleanerFormState;
    onChange: (next: CleanerFormState) => void;
    objects: { folder: string; object: string }[]; // Migrationsobjekte in Reihenfolge
    rules: CleanerRules | undefined;
    username: string;
    alias: string;
    disabled: boolean;
    planning: boolean;
    onPlan: () => void;
}

const input = 'rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm';

export function CleanerForm({
    state,
    onChange,
    objects,
    rules,
    username,
    alias,
    disabled,
    planning,
    onPlan
}: Props) {
    const excluded = new Set(rules?.exclude ?? []);
    const set = (patch: Partial<CleanerFormState>) => onChange({ ...state, ...patch });
    const toggle = (o: string) =>
        set({
            objects: state.objects.includes(o)
                ? state.objects.filter((x) => x !== o)
                : [...state.objects, o]
        });

    return (
        <div>
            <fieldset className="mb-4">
                <legend className="mb-2 text-sm font-bold">Welche Datensätze?</legend>
                <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                        type="radio"
                        name="creator"
                        className="mt-1"
                        checked={state.creator === 'me'}
                        onChange={() => set({ creator: 'me' })}
                    />
                    <span>
                        Nur von mir angelegte{' '}
                        <span className="text-grey-500">({username || 'Benutzer des Alias'})</span>{' '}
                        <b className="text-ok">empfohlen</b>
                        <span className="block text-[13px] text-grey-500">
                            Lässt Daten stehen, die mit der Sandbox kamen oder von anderen angelegt
                            wurden.
                        </span>
                    </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                        type="radio"
                        name="creator"
                        className="mt-1"
                        checked={state.creator === 'any'}
                        onChange={() => set({ creator: 'any' })}
                    />
                    <span>
                        Alle Datensätze der gewählten Objekte
                        <span className="block text-[13px] text-bad">
                            Löscht auch Daten, die schon vor der Migration in {alias} waren.
                        </span>
                    </span>
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                    Nur angelegt seit
                    <input
                        type="date"
                        className={input}
                        value={state.since}
                        onChange={(e) => set({ since: e.target.value })}
                    />
                    <span className="text-[13px] text-grey-500">(leer: keine Zeitgrenze)</span>
                </label>
            </fieldset>

            <fieldset className="mb-4">
                <legend className="mb-2 text-sm font-bold">Welche Objekte?</legend>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {objects.map((o) => (
                        <label
                            key={o.object}
                            className={`flex items-center gap-2 text-sm ${excluded.has(o.object) ? 'opacity-50' : 'cursor-pointer'}`}
                        >
                            <input
                                type="checkbox"
                                disabled={excluded.has(o.object)}
                                checked={
                                    state.objects.includes(o.object) && !excluded.has(o.object)
                                }
                                onChange={() => toggle(o.object)}
                            />
                            {o.object}
                            {excluded.has(o.object) && (
                                <span className="text-xs text-grey-500">
                                    (Projektregel: ausgenommen)
                                </span>
                            )}
                        </label>
                    ))}
                </div>
                <div className="mt-2 flex gap-3 text-[13px]">
                    <button
                        type="button"
                        className="cursor-pointer text-digital-blue underline"
                        onClick={() =>
                            set({
                                objects: objects
                                    .map((o) => o.object)
                                    .filter((o) => !excluded.has(o))
                            })
                        }
                    >
                        Alle
                    </button>
                    <button
                        type="button"
                        className="cursor-pointer text-digital-blue underline"
                        onClick={() => set({ objects: [] })}
                    >
                        Keine
                    </button>
                </div>
            </fieldset>

            <fieldset className="mb-4">
                <legend className="mb-2 text-sm font-bold">Abhängigkeiten</legend>
                <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={state.includeBlockers}
                        onChange={(e) => set({ includeBlockers: e.target.checked })}
                    />
                    Objekte mitlöschen, die das Löschen anderer verhindern (zum Beispiel Cases,
                    Orders und Entitlements am Account)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        disabled={!state.includeBlockers}
                        checked={state.blockersAnyCreator}
                        onChange={(e) => set({ blockersAnyCreator: e.target.checked })}
                    />
                    Solche Blocker auch löschen, wenn andere sie angelegt haben
                </label>
            </fieldset>

            {rules && (rules.blockers.length > 0 || rules.exclude.length > 0) && (
                <details className="mb-4 rounded-xl border border-grey-line px-4 py-2 text-[13px]">
                    <summary className="cursor-pointer font-bold">
                        Projektregeln aus cleaner.config.json
                    </summary>
                    <ul className="mt-2 mb-0 list-disc pl-5 text-grey-500">
                        {rules.blockers.map((b) => (
                            <li key={`${b.object}.${b.field}`}>
                                {b.object} ({b.field}) verhindert das Löschen von {b.blocks}
                                {b.anyCreator ? ', unabhängig vom Ersteller' : ''}
                                {b.note ? `: ${b.note}` : ''}
                            </li>
                        ))}
                        {rules.exclude.map((o) => (
                            <li key={o}>{o} wird nie angefasst</li>
                        ))}
                    </ul>
                </details>
            )}

            <Button disabled={disabled || planning || state.objects.length === 0} onClick={onPlan}>
                {planning ? 'Zähle in der Ziel-Org … (ca. 1 Minute)' : 'Plan berechnen'}
            </Button>
            <span className="ml-3 text-[13px] text-grey-500">
                Liest nur und zählt, löscht noch nichts.
            </span>
        </div>
    );
}
