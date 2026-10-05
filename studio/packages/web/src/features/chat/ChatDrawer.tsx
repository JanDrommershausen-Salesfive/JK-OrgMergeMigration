import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useLocation, useNavigate } from 'react-router';
import remarkGfm from 'remark-gfm';
import { Drawer } from '../../components/Drawer';
import { Button } from '../../components/ui';
import type { Proposal } from '@studio/shared';
import { chatContext, type ChatMessage } from './chatState';
import type { useChat } from './useChat';

type Chat = ReturnType<typeof useChat>;

const markdown = {
    table: (p: object) => <table className="my-2 w-full border-collapse text-[13px]" {...p} />,
    th: (p: object) => (
        <th className="border-b border-grey-line px-2 py-1 text-left font-bold" {...p} />
    ),
    td: (p: object) => <td className="border-b border-grey-100 px-2 py-1 align-top" {...p} />,
    code: (p: object) => (
        <code className="rounded bg-grey-100 px-1 font-mono text-[12.5px]" {...p} />
    ),
    p: (p: object) => <p className="my-1.5" {...p} />,
    ul: (p: object) => <ul className="my-1.5 list-disc pl-5" {...p} />,
    ol: (p: object) => <ol className="my-1.5 list-decimal pl-5" {...p} />
};

const STATUS_TEXT: Record<Proposal['status'], string> = {
    pending: 'Wartet auf dich',
    applied: 'Übernommen',
    rejected: 'Verworfen',
    failed: 'Fehlgeschlagen'
};

// Vorschlag von Claude: geändert wird erst nach Klick auf „Übernehmen“.
function ProposalCard({
    p,
    onDecide
}: {
    p: Proposal;
    onDecide: (id: string, action: 'apply' | 'reject') => void;
}) {
    const navigate = useNavigate();
    // Abfragevorschläge ändern nichts: „Öffnen“ lädt die Abfrage in den Query-Editor, ausgeführt wird sie dort.
    const query = p.kind === 'soql-query' ? p.details[0] : undefined;
    const org = p.title.includes('Ziel') ? 'target' : 'source';
    const tone =
        p.status === 'applied'
            ? 'border-ok bg-ok-soft'
            : p.status === 'failed'
              ? 'border-bad bg-bad-soft'
              : 'border-digital-blue bg-white';
    return (
        <section
            aria-label={`Vorschlag: ${p.title}`}
            className={`mt-2 rounded-xl border p-3 text-[13px] ${tone}`}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {p.folder && (
                        <div className="text-xs font-bold text-digital-blue">{p.folder}</div>
                    )}
                    <div className="font-bold">{p.title}</div>
                </div>
                <span className="text-xs text-grey-500">{STATUS_TEXT[p.status]}</span>
            </div>
            {p.details.length > 0 && (
                <ul className="mt-1 mb-0 list-disc pl-5 font-mono text-[12.5px]">
                    {p.details.slice(0, 20).map((d, i) => (
                        <li key={i}>{d}</li>
                    ))}
                    {p.details.length > 20 && <li>… und {p.details.length - 20} weitere</li>}
                </ul>
            )}
            <p className="mt-1 mb-0 text-grey-500">{p.reason}</p>
            {p.message && (
                <p className={`mt-1 mb-0 ${p.status === 'failed' ? 'text-bad' : 'text-ok'}`}>
                    {p.message}
                </p>
            )}
            {p.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                    {query ? (
                        <Button
                            small
                            onClick={() => {
                                onDecide(p.id, 'apply');
                                navigate(
                                    `/tools/query?org=${org}&soql=${encodeURIComponent(query)}&t=${Date.now()}`
                                );
                            }}
                        >
                            Im Query-Editor öffnen
                        </Button>
                    ) : (
                        <Button small onClick={() => onDecide(p.id, 'apply')}>
                            Übernehmen
                        </Button>
                    )}
                    <Button small variant="ghost" onClick={() => onDecide(p.id, 'reject')}>
                        Verwerfen
                    </Button>
                </div>
            )}
        </section>
    );
}

function Bubble({
    m,
    onDecide
}: {
    m: ChatMessage;
    onDecide: (id: string, action: 'apply' | 'reject') => void;
}) {
    if (m.role === 'user') {
        return (
            <div className="ml-10 self-end rounded-2xl rounded-br-sm bg-digital-blue px-4 py-2 text-sm whitespace-pre-wrap text-white">
                {m.text}
            </div>
        );
    }
    return (
        <div className="mr-6 text-sm">
            {m.tools.map((t, i) => (
                <div key={i} className="mb-1 text-xs text-grey-500">
                    ⚙ {t.summary}
                </div>
            ))}
            {m.text && (
                <div className="rounded-2xl rounded-bl-sm bg-grey-100 px-4 py-2">
                    <Markdown remarkPlugins={[remarkGfm]} components={markdown}>
                        {m.text}
                    </Markdown>
                </div>
            )}
            {m.proposals.map((p) => (
                <ProposalCard key={p.id} p={p} onDecide={onDecide} />
            ))}
            {!m.done && <div className="mt-1 text-xs text-grey-500">Claude arbeitet …</div>}
            {m.error && (
                <div role="alert" className="mt-1 text-[13px] text-bad">
                    {m.error}
                </div>
            )}
        </div>
    );
}

interface Props {
    open: boolean;
    onClose: () => void;
    chat: Chat;
}

// Chat mit Claude als Seitenleiste. Ohne Abdunklung, damit die Seite daneben sichtbar bleibt.
export function ChatDrawer({ open, onClose, chat }: Props) {
    const { pathname } = useLocation();
    const [text, setText] = useState('');
    const end = useRef<HTMLDivElement>(null);
    const ctx = chatContext(pathname);
    const unavailable = chat.status && !chat.status.available;

    useEffect(() => {
        if (open) end.current?.scrollIntoView?.({ block: 'end' });
    }, [open, chat.messages]);

    const submit = () => {
        const message = text.trim();
        if (!message || chat.running || unavailable) return;
        setText('');
        void chat.send(message, ctx);
    };

    return (
        <Drawer
            open={open}
            wide
            backdrop={false}
            kicker="Migrations-Assistent"
            title="Claude"
            onClose={onClose}
        >
            <div className="flex h-[calc(100vh-8rem)] flex-col">
                <div className="mb-2 flex items-center gap-2 text-xs text-grey-500">
                    <span className="rounded-full bg-grey-100 px-2 py-0.5">
                        Kontext: {ctx.folder ?? 'allgemein'}
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        className="cursor-pointer underline disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={chat.running || chat.messages.length === 0}
                        onClick={() => void chat.reset()}
                    >
                        Neues Gespräch
                    </button>
                </div>
                {unavailable && (
                    <p
                        role="alert"
                        className="mb-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn"
                    >
                        {chat.status?.hint}
                    </p>
                )}
                <div className="flex flex-1 flex-col gap-3 overflow-auto pr-1" aria-live="polite">
                    {chat.messages.length === 0 && !unavailable && (
                        <p className="text-[13px] text-grey-500">
                            Frag zum Beispiel: „Welche Felder fehlen bei Account im Ziel?“ oder „Was
                            bedeuten die Fehler im letzten Lauf?“. Claude kann Konfigurationen,
                            Läufe, Versionen und To-Dos lesen. Ändern kann es nichts, und Datensätze
                            aus den Orgs sieht es nicht.
                        </p>
                    )}
                    {chat.messages.map((m, i) => (
                        <Bubble key={i} m={m} onDecide={(id, a) => void chat.decide(id, a)} />
                    ))}
                    <div ref={end} />
                </div>
                {chat.error && (
                    <p role="alert" className="mt-2 text-[13px] text-bad">
                        {chat.error}
                    </p>
                )}
                <form
                    className="mt-3 flex items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    <textarea
                        aria-label="Nachricht an Claude"
                        className="min-h-11 flex-1 resize-none rounded-xl border border-grey-line px-3 py-2 text-sm"
                        rows={2}
                        value={text}
                        placeholder="Nachricht (Enter sendet, Shift+Enter neue Zeile)"
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                    />
                    {chat.running ? (
                        <Button type="button" variant="ghost" onClick={chat.stop}>
                            Anhalten
                        </Button>
                    ) : (
                        <Button type="submit" disabled={!text.trim() || !!unavailable}>
                            Senden
                        </Button>
                    )}
                </form>
            </div>
        </Drawer>
    );
}
