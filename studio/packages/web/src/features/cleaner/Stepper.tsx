export type Phase = 'setup' | 'planned' | 'running' | 'finished';

interface Stage {
    phase: Phase;
    label: string;
    guidance: string;
}

export const STAGES: Stage[] = [
    {
        phase: 'setup',
        label: 'Konfiguration',
        guidance:
            'Lege fest, was gelöscht werden soll: welche Datensätze (Standard: nur von dir angelegte) und welche Objekte. Danach berechnet der Plan, was das in der Ziel-Org bedeutet. Es wird noch nichts gelöscht.'
    },
    {
        phase: 'planned',
        label: 'Plan',
        guidance:
            'Prüfe die Reihenfolge und die Zahlen. Blocker sind Objekte, die das Löschen anderer verhindern und deshalb davor gelöscht werden. Erst „Löschen starten“ löscht, und nur nach Eingabe des Alias.'
    },
    {
        phase: 'running',
        label: 'Löschen',
        guidance:
            'Es wird Schritt für Schritt gelöscht, Kinder vor Eltern. Reste, die an Abhängigkeiten scheitern, werden in weiteren Durchläufen erneut versucht. Du kannst jederzeit anhalten.'
    },
    {
        phase: 'finished',
        label: 'Fertig',
        guidance:
            'Das Ergebnis dieses Laufs. Mit „Neuer Löschlauf“ setzt du alles zurück und konfigurierst den nächsten, deine letzte Auswahl bleibt dabei erhalten.'
    }
];

// Chevron-Form wie beim Salesforce-Path: erste Stufe mit gerader Kante links, letzte mit gerader Kante rechts.
const SHAPE = {
    first: '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)] rounded-l-full',
    middle: '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%,14px_50%)]',
    last: '[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,14px_50%)] rounded-r-full'
};

interface Props {
    phase: Phase;
    // Klick auf die erste Stufe, solange der Plan steht: zurück zur Konfiguration (ändert nichts am Plan, bis neu berechnet wird)
    onBackToConfig?: () => void;
}

// Salesforce-Path für den Ablauf des Löschlaufs. Der Ablauf geht nur vorwärts; zurück geht es über die Konfiguration
// (solange nichts gelöscht wird) oder über "Neuer Löschlauf".
export function Path({ phase, onBackToConfig }: Props) {
    const current = STAGES.findIndex((s) => s.phase === phase);
    return (
        <ol aria-label="Ablauf" className="m-0 flex list-none p-0">
            {STAGES.map((s, i) => {
                const done = i < current;
                const shape =
                    i === 0 ? SHAPE.first : i === STAGES.length - 1 ? SHAPE.last : SHAPE.middle;
                const tone =
                    i === current
                        ? 'bg-deep text-white'
                        : done
                          ? 'bg-ok text-white'
                          : 'bg-grey-100 text-ink';
                const clickable = i === 0 && phase === 'planned' && !!onBackToConfig;
                return (
                    <li
                        key={s.phase}
                        aria-current={i === current ? 'step' : undefined}
                        className={`-ml-1.5 flex-1 first:ml-0`}
                    >
                        {clickable ? (
                            <button
                                type="button"
                                onClick={onBackToConfig}
                                title="Zurück zur Konfiguration"
                                className={`flex h-10 w-full cursor-pointer items-center justify-center px-5 text-sm font-bold hover:opacity-90 ${shape} ${tone}`}
                            >
                                {done ? '✓ ' : ''}
                                {s.label}
                            </button>
                        ) : (
                            <div
                                className={`flex h-10 items-center justify-center px-5 text-sm font-bold ${shape} ${tone}`}
                            >
                                {done ? '✓ ' : ''}
                                {s.label}
                            </div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

export function stageGuidance(phase: Phase): string {
    return STAGES.find((s) => s.phase === phase)?.guidance ?? '';
}
