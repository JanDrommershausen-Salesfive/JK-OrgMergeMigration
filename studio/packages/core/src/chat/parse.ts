import type { ChatEvent } from '@studio/shared';
import { MCP_SERVER_NAME } from './args';

export interface ParsedLine {
    events: ChatEvent[];
    sessionId?: string;
}

const PREFIX = `mcp__${MCP_SERVER_NAME}__`;

// Kurzer Text zum Werkzeugaufruf für die Anzeige, ohne die Eingaben vollständig zu zeigen.
function summarize(name: string, input: unknown): string {
    const args =
        input && typeof input === 'object'
            ? Object.values(input as Record<string, unknown>)
                  .filter((v) => typeof v === 'string' || typeof v === 'number')
                  .join(', ')
            : '';
    return args ? `${name} (${args})` : name;
}

// Übersetzt eine Zeile der stream-json-Ausgabe der CLI in Chat-Ereignisse. Unbekanntes wird ignoriert.
// state.deltas merkt, ob der Text der laufenden Nachricht schon in Stücken kam, damit er nicht doppelt erscheint.
export function parseStreamLine(line: string, state: { deltas: boolean }): ParsedLine {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Ausgabe der CLI, nur benötigte Felder werden geprüft
    let msg: Record<string, any>;
    try {
        msg = JSON.parse(line);
    } catch {
        return { events: [] };
    }
    const sessionId = typeof msg.session_id === 'string' ? msg.session_id : undefined;

    if (msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'message_start') state.deltas = false;
        if (
            ev?.type === 'content_block_delta' &&
            ev.delta?.type === 'text_delta' &&
            ev.delta.text
        ) {
            state.deltas = true;
            return { sessionId, events: [{ type: 'text', text: ev.delta.text }] };
        }
        return { sessionId, events: [] };
    }

    if (msg.type === 'assistant') {
        const events: ChatEvent[] = [];
        for (const block of msg.message?.content ?? []) {
            if (block.type === 'tool_use' && typeof block.name === 'string') {
                const name = block.name.startsWith(PREFIX)
                    ? block.name.slice(PREFIX.length)
                    : block.name;
                events.push({ type: 'tool', name, summary: summarize(name, block.input) });
            } else if (block.type === 'text' && block.text && !state.deltas) {
                events.push({ type: 'text', text: block.text });
            }
        }
        return { sessionId, events };
    }

    if (msg.type === 'result') {
        const failed =
            msg.is_error === true ||
            (typeof msg.subtype === 'string' && msg.subtype.startsWith('error'));
        return {
            sessionId,
            events: [
                {
                    type: 'end',
                    ok: !failed,
                    ...(failed
                        ? { error: String(msg.result ?? msg.subtype ?? 'Unbekannter Fehler') }
                        : {})
                }
            ]
        };
    }
    return { sessionId, events: [] };
}
