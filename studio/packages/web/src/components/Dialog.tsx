import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
}

// Modaler Dialog auf Basis von <dialog>: Esc schließt, Fokus bleibt im Dialog.
export function Dialog({ open, title, onClose, children }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (open && !el.open) el.showModal();
        if (!open && el.open) el.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-labelledby="dialog-title"
            onClose={onClose}
            className="m-auto w-[min(900px,calc(100vw-2rem))] rounded-xl border border-grey-line bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"
        >
            {open && (
                <div className="p-6">
                    <h2 id="dialog-title" className="mb-4 text-xl font-normal tracking-tighter">
                        {title}
                    </h2>
                    {children}
                </div>
            )}
        </dialog>
    );
}
