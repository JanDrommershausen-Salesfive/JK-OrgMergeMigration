import { useCallback, useState } from 'react';

export interface SaveMessage {
    text: string;
    error: boolean;
}

// Meldung "gespeichert" oder Fehlertext neben den Tabs. Mutationen rufen report() auf.
export function useSaveMessage() {
    const [message, setMessage] = useState<SaveMessage | null>(null);
    const report = useCallback((text: string, error = false) => setMessage({ text, error }), []);
    return { message, report };
}

export type Report = (text: string, error?: boolean) => void;
