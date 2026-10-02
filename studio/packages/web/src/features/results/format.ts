import type { LastRun, RunMeta } from '@studio/shared';

export function formatDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const modeLabel = (mode: RunMeta['mode']) => (mode === 'live' ? 'Live' : 'Simulation');

export const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

export const statusIcon = (run: Pick<RunMeta, 'ok' | 'stopped'>) =>
    run.stopped ? '■' : run.ok ? '✓' : '✕';

// Kurzstatus: was ist bei diesem Lauf auffällig?
export function hasFindings(run: RunMeta): boolean {
    return !run.ok || run.counts.errors > 0 || run.counts.missingParents > 0;
}

// Kurztext für den letzten Lauf eines Objekts (Liste, Übersicht).
export function lastRunFindings(run: LastRun): string {
    const parts = [
        run.errors ? `${run.errors} Fehler` : '',
        run.missingParents ? `${run.missingParents} ohne Parent` : ''
    ].filter(Boolean);
    return parts.join(', ');
}
