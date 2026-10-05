import { useEffect, useRef } from 'react';
import { Drawer } from '../../components/Drawer';

interface Props {
    open: boolean;
    log: string;
    running: boolean;
    onClear: () => void;
    onClose: () => void;
}

// Terminal-Ausgabe des Laufs in einer Seitenleiste. Ohne Abdunklung, damit die Seite daneben bedienbar bleibt.
export function Terminal({ open, log, running, onClear, onClose }: Props) {
    const pre = useRef<HTMLPreElement>(null);

    // Mit neuem Text nach unten scrollen.
    useEffect(() => {
        if (open && pre.current) pre.current.scrollTop = pre.current.scrollHeight;
    }, [log, open]);

    const bar =
        'cursor-pointer rounded-full border border-grey-line px-3 py-1 text-xs font-bold hover:border-ink';
    return (
        <Drawer
            open={open}
            wide
            backdrop={false}
            kicker={running ? 'Lauf läuft' : undefined}
            title="Terminal"
            onClose={onClose}
        >
            <div className="mb-3 flex gap-2">
                <button
                    type="button"
                    className={bar}
                    onClick={() => void navigator.clipboard.writeText(log)}
                >
                    Kopieren
                </button>
                <button type="button" className={bar} onClick={onClear}>
                    Löschen
                </button>
            </div>
            <pre
                ref={pre}
                className="m-0 h-[calc(100vh-10rem)] overflow-auto rounded-xl bg-[#0b0f19] p-4 font-mono text-[12.5px] leading-normal break-words whitespace-pre-wrap text-[#d5dde8]"
            >
                {log || 'Noch kein Lauf gestartet.'}
            </pre>
        </Drawer>
    );
}
