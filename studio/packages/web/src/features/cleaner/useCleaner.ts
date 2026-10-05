import { CleanEventSchema, type CleanEvent } from '@studio/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

export type StepState = Extract<CleanEvent, { type: 'step' }>;
export type EndState = Extract<CleanEvent, { type: 'end' }>;

// Verfolgt einen Löschauftrag: Protokoll, Zustand je Schritt und Ende. Der Server puffert die Ereignisse,
// deshalb zeigt auch eine neu geöffnete Seite den laufenden oder letzten Auftrag.
export function useCleanerStream() {
    const client = useQueryClient();
    const [log, setLog] = useState('');
    const [steps, setSteps] = useState<Record<number, StepState>>({});
    const [end, setEnd] = useState<EndState | null>(null);
    const source = useRef<EventSource | null>(null);

    const disconnect = useCallback(() => {
        source.current?.close();
        source.current = null;
    }, []);

    const connect = useCallback(() => {
        disconnect();
        setLog('');
        setSteps({});
        setEnd(null);
        const es = new EventSource('/api/tools/cleaner/events');
        source.current = es;
        es.onmessage = (msg) => {
            const e = CleanEventSchema.parse(JSON.parse(msg.data as string));
            if (e.type === 'log') setLog((l) => l + e.text);
            else if (e.type === 'step') setSteps((s) => ({ ...s, [e.order]: e }));
            else {
                setEnd(e);
                disconnect(); // sonst verbindet EventSource nach dem Ende neu
                void client.invalidateQueries({ queryKey: ['cleanerStatus'] });
            }
        };
    }, [client, disconnect]);

    useEffect(() => {
        connect();
        return disconnect;
    }, [connect, disconnect]);

    return { log, steps, end, reconnect: connect };
}
