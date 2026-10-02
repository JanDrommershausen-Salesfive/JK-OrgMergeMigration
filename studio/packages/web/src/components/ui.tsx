import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'plain' | 'key' | 'warn' | 'map' | 'ok' | 'bad' | 'ren';

const TONES: Record<Tone, string> = {
    plain: 'bg-grey-100 text-ink',
    key: 'bg-digital-blue text-white font-bold',
    warn: 'bg-warn-soft text-warn',
    map: 'bg-open-blue text-black font-bold',
    ok: 'bg-ok-soft text-ok font-bold',
    bad: 'bg-bad-soft text-bad font-bold',
    ren: 'bg-digital-blue text-white font-bold'
};

export function Tag({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span
            className={`mr-1 mb-0.5 inline-block rounded-full px-2 py-px text-xs whitespace-nowrap ${TONES[tone]}`}
        >
            {children}
        </span>
    );
}

type Variant = 'primary' | 'danger' | 'ghost' | 'onDark';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-digital-blue text-white hover:enabled:bg-deep',
    danger: 'bg-bad text-white hover:enabled:opacity-90',
    ghost: 'border-grey-line bg-transparent text-ink hover:enabled:border-ink',
    onDark: 'border-white/40 bg-transparent text-white hover:enabled:border-white'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    small?: boolean;
}

export function Button({ variant = 'primary', small, className = '', ...props }: ButtonProps) {
    const size = small ? 'min-h-9 px-4 py-1.5' : 'min-h-11 px-5 py-2';
    return (
        <button
            {...props}
            className={`cursor-pointer rounded-full border border-transparent font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${size} ${VARIANTS[variant]} ${className}`}
        />
    );
}

export function Panel({ children, label }: { children: ReactNode; label: string }) {
    return (
        <section aria-label={label} className="rounded-xl border border-grey-line bg-white">
            {children}
        </section>
    );
}
