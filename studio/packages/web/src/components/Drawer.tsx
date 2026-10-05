import { useEffect, type ReactNode } from 'react';

interface Props {
    open: boolean;
    title: string;
    kicker?: string;
    onClose: () => void;
    wide?: boolean;
    backdrop?: boolean; // false: Seite dahinter bleibt bedienbar
    children: ReactNode;
}

// Seitenleiste von rechts über der Seite: für Hilfsfunktionen, die nicht zum Ablauf gehören (zum Beispiel Versionen).
// Schließen per Kreuz, Klick auf den Hintergrund oder Esc.
export function Drawer({ open, title, kicker, onClose, wide, backdrop = true, children }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <>
            {backdrop && (
                <div
                    aria-hidden="true"
                    onClick={onClose}
                    className={`fixed inset-0 z-30 bg-black/20 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                />
            )}
            <aside
                role="dialog"
                aria-label={title}
                aria-hidden={!open}
                className={`fixed top-0 right-0 z-40 h-screen ${wide ? 'w-[min(680px,100vw)]' : 'w-[min(480px,100vw)]'} overflow-auto bg-white p-6 transition-transform duration-200 ${open ? 'translate-x-0 shadow-[-16px_0_50px_rgba(0,0,0,.15)]' : 'invisible translate-x-full'}`}
            >
                <div className="mb-4 flex items-start gap-3">
                    <div className="flex-1">
                        {kicker && (
                            <div className="text-xs font-bold text-digital-blue">{kicker}</div>
                        )}
                        <h2 className="m-0 text-xl font-normal tracking-tighter">{title}</h2>
                    </div>
                    <button
                        type="button"
                        aria-label="Schließen"
                        onClick={onClose}
                        className="size-8 cursor-pointer rounded-full bg-grey-100 text-lg leading-none hover:bg-grey-line"
                    >
                        ×
                    </button>
                </div>
                {open && children}
            </aside>
        </>
    );
}
