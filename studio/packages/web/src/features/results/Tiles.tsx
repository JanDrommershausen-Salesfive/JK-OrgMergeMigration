import type { RunMeta } from '@studio/shared';
import { formatDuration } from './format';

export type Section = 'fehler' | 'parents' | 'warnungen' | 'zusammenfassung' | 'log';

interface Tile {
    label: string;
    value: string | number;
    tone: 'plain' | 'ok' | 'bad' | 'warn';
    section?: Section; // Kachel schaltet die Ansicht darunter um
}

const TONES = {
    plain: 'text-ink',
    ok: 'text-ok',
    bad: 'text-bad',
    warn: 'text-warn'
};

interface Props {
    meta: RunMeta;
    active: Section;
    onSelect: (section: Section) => void;
}

// Kacheln mit den Kennzahlen; die klickbaren dienen zugleich als Umschalter für die Ansicht.
export function Tiles({ meta, active, onSelect }: Props) {
    const c = meta.counts;
    const tiles: Tile[] = [
        { label: 'Eingefügt', value: c.inserted, tone: 'plain', section: 'zusammenfassung' },
        { label: 'Aktualisiert', value: c.updated, tone: 'plain', section: 'zusammenfassung' },
        { label: 'Fehler', value: c.errors, tone: c.errors ? 'bad' : 'ok', section: 'fehler' },
        {
            label: 'Fehlende Parents',
            value: c.missingParents,
            tone: c.missingParents ? 'warn' : 'ok',
            section: 'parents'
        },
        {
            label: 'Warnungen',
            value: c.warnings,
            tone: c.warnings ? 'warn' : 'plain',
            section: 'warnungen'
        },
        { label: 'Dauer', value: formatDuration(meta.durationMs), tone: 'plain' }
    ];
    return (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => {
                const body = (
                    <>
                        <div
                            className={`text-[26px] leading-none tracking-tighter ${TONES[t.tone]}`}
                        >
                            {t.value}
                        </div>
                        <div className="mt-1 text-xs text-grey-500">{t.label}</div>
                    </>
                );
                const base = 'rounded-xl border px-4 py-3 text-left';
                return t.section ? (
                    <button
                        key={t.label}
                        type="button"
                        aria-pressed={active === t.section}
                        onClick={() => onSelect(t.section as Section)}
                        className={`${base} cursor-pointer hover:border-ink ${active === t.section ? 'border-digital-blue ring-1 ring-digital-blue' : 'border-grey-line'}`}
                    >
                        {body}
                    </button>
                ) : (
                    <div key={t.label} className={`${base} border-grey-line`}>
                        {body}
                    </div>
                );
            })}
        </div>
    );
}
