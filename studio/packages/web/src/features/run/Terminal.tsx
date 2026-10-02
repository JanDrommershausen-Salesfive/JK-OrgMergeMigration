import { useEffect, useRef, useState } from 'react';

interface Props {
    log: string;
    running: boolean;
    onClear: () => void;
}

export function Terminal({ log, running, onClear }: Props) {
    const [open, setOpen] = useState(false);
    const pre = useRef<HTMLPreElement>(null);

    // Beim Start eines Laufs aufklappen und mit neuem Text nach unten scrollen.
    useEffect(() => {
        if (running) setOpen(true);
    }, [running]);
    useEffect(() => {
        if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
    }, [log, open]);

    const bar =
        'cursor-pointer rounded-full border border-white/25 px-3 py-0.5 text-xs text-white/70 hover:border-white hover:text-white';
    return (
        <section
            aria-label="Terminal"
            className="col-span-full overflow-hidden rounded-xl bg-[#0b0f19]"
        >
            <div className="flex items-center gap-2 bg-[#141a2a] px-4 py-2 text-xs font-bold text-white/70">
                <button
                    type="button"
                    className="cursor-pointer font-bold text-white/85"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                >
                    {open ? '▾' : '▸'} TERMINAL
                </button>
                <span className="flex-1" />
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
            {open && (
                <pre
                    ref={pre}
                    className="m-0 h-80 overflow-auto p-4 font-mono text-[12.5px] leading-normal break-words whitespace-pre-wrap text-[#d5dde8]"
                >
                    {log || 'Noch kein Lauf gestartet.'}
                </pre>
            )}
        </section>
    );
}
