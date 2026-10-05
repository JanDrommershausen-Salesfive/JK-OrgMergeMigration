import type { ChatEvent, Proposal } from '@studio/shared';

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
    tools: { name: string; summary: string }[];
    proposals: Proposal[];
    done: boolean;
    error?: string;
}

// Wendet ein Ereignis des Servers auf den Verlauf an. Eine Antwort beginnt mit dem ersten Werkzeug- oder Textereignis
// nach einer Nutzernachricht und endet mit "end".
export function applyChatEvent(messages: ChatMessage[], e: ChatEvent): ChatMessage[] {
    if (e.type === 'reset') return [];
    if (e.type === 'user') {
        return [...messages, { role: 'user', text: e.text, tools: [], proposals: [], done: true }];
    }
    if (e.type === 'proposal-status') {
        return messages.map((m) => ({
            ...m,
            proposals: m.proposals.map((p) =>
                p.id === e.id ? { ...p, status: e.status, message: e.message } : p
            )
        }));
    }
    const last = messages[messages.length - 1];
    // Eine Antwort gehört zur letzten Antwortnachricht, solange sie offen ist (Vorschläge auch danach).
    const open =
        last && last.role === 'assistant' && (!last.done || e.type === 'proposal') ? last : null;
    const base = messages.slice(0, open ? -1 : undefined);
    const current: ChatMessage = open ?? {
        role: 'assistant',
        text: '',
        tools: [],
        proposals: [],
        done: false
    };
    if (e.type === 'text') return [...base, { ...current, text: current.text + e.text }];
    if (e.type === 'tool') {
        return [
            ...base,
            { ...current, tools: [...current.tools, { name: e.name, summary: e.summary }] }
        ];
    }
    if (e.type === 'proposal') {
        return [...base, { ...current, proposals: [...current.proposals, e.proposal] }];
    }
    return [
        ...base,
        { ...current, done: true, ...(e.ok ? {} : { error: e.error ?? 'Fehlgeschlagen' }) }
    ];
}

// Kontext der Oberfläche aus der Adresse: Objektordner und Lauf.
export function chatContext(pathname: string) {
    const config = pathname.match(/^\/konfiguration\/([^/]+)/);
    const run = pathname.match(/^\/laeufe\/([^/]+)\/([^/]+)/);
    return {
        page: pathname,
        ...(config || run ? { folder: (config?.[1] ?? run?.[1]) as string } : {}),
        ...(run ? { runId: run[2] } : {})
    };
}
