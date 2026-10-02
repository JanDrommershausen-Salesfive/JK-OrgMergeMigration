import { RunEventSchema, type RunMode } from '@studio/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useRunStatus } from '../../api/queries';

// Startet und stoppt Läufe und hält das Terminal-Log. Der Server puffert das Log,
// deshalb zeigt auch eine neu geöffnete GUI den laufenden oder letzten Lauf.
export function useRun() {
    const client = useQueryClient();
    const status = useRunStatus();
    const [log, setLog] = useState('');
    const source = useRef<EventSource | null>(null);

    const disconnect = useCallback(() => {
        source.current?.close();
        source.current = null;
    }, []);

    const connect = useCallback(() => {
        disconnect();
        setLog('');
        const es = new EventSource('/api/run/events');
        source.current = es;
        es.onmessage = (msg) => {
            const event = RunEventSchema.parse(JSON.parse(msg.data as string));
            if (event.type === 'log') {
                setLog((l) => l + event.text);
                return;
            }
            // Lauf beendet: Stream schließen (sonst verbindet EventSource neu) und Anzeigen aktualisieren.
            disconnect();
            void client.invalidateQueries({ queryKey: ['run'] });
            void client.invalidateQueries({ queryKey: ['objects'] });
        };
    }, [client, disconnect]);

    useEffect(() => {
        connect();
        return disconnect;
    }, [connect, disconnect]);

    const start = useCallback(
        async (folder: string, mode: RunMode) => {
            try {
                await api.startRun(folder, mode);
            } catch (e) {
                setLog(e instanceof Error ? e.message : String(e));
                return;
            }
            connect();
            void client.invalidateQueries({ queryKey: ['run'] });
        },
        [client, connect]
    );

    const stop = useCallback(() => void api.stopRun(), []);

    return { running: status.data?.running ?? false, log, clearLog: () => setLog(''), start, stop };
}
