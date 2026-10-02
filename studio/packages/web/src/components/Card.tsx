import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-text-muted">{title}</h2>
            {children}
        </section>
    );
}
