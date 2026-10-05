import { Tag } from '../../components/ui';
import type { StepState } from './useCleaner';

const STATE: Record<StepState['state'], { text: string; tone: 'plain' | 'ok' | 'warn' | 'bad' }> = {
    running: { text: 'läuft …', tone: 'warn' },
    done: { text: '✓ gelöscht', tone: 'ok' },
    partial: { text: 'teilweise', tone: 'warn' },
    failed: { text: '✕ nicht löschbar', tone: 'bad' },
    skipped: { text: 'nichts zu tun', tone: 'plain' }
};

const th = 'px-3 py-2 text-left text-xs font-bold whitespace-nowrap text-grey-500';
const td = 'border-t border-grey-100 px-3 py-2 text-sm';

// Zustand je Schritt eines laufenden oder beendeten Auftrags. Kommt allein aus den Ereignissen des Servers,
// funktioniert also auch nach einem Neuladen der Seite.
export function LiveSteps({ steps }: { steps: Record<number, StepState> }) {
    const rows = Object.values(steps).sort((a, b) => a.order - b.order);
    if (!rows.length)
        return <p className="text-[13px] text-grey-500">Noch keine Schritte gestartet …</p>;
    return (
        <table className="w-full border-collapse">
            <thead>
                <tr>
                    <th className={th}>Schritt</th>
                    <th className={th}>Objekt</th>
                    <th className={`${th} text-right`}>Gelöscht</th>
                    <th className={`${th} text-right`}>Übrig</th>
                    <th className={th}>Zustand</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.order}>
                        <td className={td}>{r.order}</td>
                        <td className={`${td} font-bold`}>{r.object}</td>
                        <td className={`${td} text-right`}>{r.deleted}</td>
                        <td className={`${td} text-right`}>{r.remaining ?? '–'}</td>
                        <td className={td}>
                            <Tag tone={STATE[r.state].tone}>{STATE[r.state].text}</Tag>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
