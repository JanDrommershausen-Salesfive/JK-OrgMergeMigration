import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui';
import type { SaveMessage } from './saveMessage';

interface NavTarget {
    to: string;
    label: string;
}

interface Props {
    title: string;
    guidance: string;
    message: SaveMessage | null; // Speichermeldung der Änderungen in diesem Schritt
    toolbar?: ReactNode; // rechts neben der Überschrift
    back?: NavTarget;
    next: NavTarget;
    children: ReactNode;
}

// Ein Schritt der Konfiguration: Überschrift mit erklärendem Satz, der Inhalt und unten Zurück und Weiter.
export function StepPage({ title, guidance, message, toolbar, back, next, children }: Props) {
    const navigate = useNavigate();
    return (
        <section aria-label={title}>
            <div className="mb-4 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-base font-bold">{title}</h3>
                    <p className="m-0 mt-1 text-[13px] text-grey-500">{guidance}</p>
                </div>
                {message && (
                    <span
                        role="status"
                        className={`text-[13px] ${message.error ? 'text-bad' : 'text-ok'}`}
                    >
                        {message.text}
                    </span>
                )}
                {toolbar}
            </div>
            {children}
            <div className="mt-6 flex items-center justify-between border-t border-grey-line pt-4">
                {back ? (
                    <Button variant="ghost" onClick={() => navigate(back.to)}>
                        {back.label}
                    </Button>
                ) : (
                    <span />
                )}
                <Button onClick={() => navigate(next.to)}>{next.label}</Button>
            </div>
        </section>
    );
}
