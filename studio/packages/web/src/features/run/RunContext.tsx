import { createContext, useContext, type ReactNode } from 'react';
import { useRun } from './useRun';

type RunApi = ReturnType<typeof useRun>;
const RunContext = createContext<RunApi | null>(null);

// Ein Lauf zugleich, für alle Seiten gleich: Status, Log, Start und Stopp.
export function RunProvider({ children }: { children: ReactNode }) {
    return <RunContext.Provider value={useRun()}>{children}</RunContext.Provider>;
}

export function useRunContext(): RunApi {
    const ctx = useContext(RunContext);
    if (!ctx) throw new Error('useRunContext braucht einen RunProvider.');
    return ctx;
}
