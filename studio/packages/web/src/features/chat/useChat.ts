import { ChatEventSchema } from '@studio/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { applyChatEvent, type ChatMessage } from './chatState';

// Gespräch mit Claude. Der Server hält den Verlauf und spielt ihn bei jeder Verbindung vor,
// deshalb beginnt die Anzeige bei (Wieder-)Verbindung leer.
export function useChat() {
    const client = useQueryClient();
    const status = useQuery({ queryKey: ['chat'], queryFn: api.chatStatus, staleTime: 30_000 });
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const source = useRef<EventSource | null>(null);

    useEffect(() => {
        const es = new EventSource('/api/chat/events');
        source.current = es;
        es.onopen = () => setMessages([]);
        es.onmessage = (msg) => {
            const event = ChatEventSchema.parse(JSON.parse(msg.data as string));
            setMessages((m) => applyChatEvent(m, event));
            // Eine übernommene Änderung betrifft Objekte, Query, Versionen und To-Dos: alles neu laden (außer dem Chat selbst).
            if (event.type === 'proposal-status' && event.status === 'applied') {
                void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'chat' });
            }
        };
        return () => es.close();
    }, [client]);

    const last = messages[messages.length - 1];
    // Zwischen Senden und erstem Ereignis gibt es noch keine Antwort; die Nutzernachricht allein zählt als laufend.
    const running = last ? last.role === 'user' || !last.done : false;

    const send = useCallback(
        async (message: string, context: Parameters<typeof api.chatSend>[0]['context']) => {
            setError(null);
            try {
                await api.chatSend({ message, context });
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        },
        []
    );
    const decide = useCallback(async (id: string, action: 'apply' | 'reject') => {
        setError(null);
        try {
            await (action === 'apply' ? api.applyProposal(id) : api.rejectProposal(id));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);
    const stop = useCallback(() => void api.chatStop(), []);
    const reset = useCallback(async () => {
        setError(null);
        try {
            await api.chatReset();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    return {
        status: status.data,
        messages,
        running,
        error,
        send,
        stop,
        reset,
        decide,
        refetchStatus: status.refetch
    };
}
