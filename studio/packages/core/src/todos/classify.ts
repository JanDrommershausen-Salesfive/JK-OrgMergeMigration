import type { TodoCategory } from '@studio/shared';

export interface Classified {
    category: TodoCategory;
    field: string | null;
    apiField: string | null;
    message: string; // bereinigt, ohne Ids, Zahlen und Werte
    suggestion: string;
    step: 'query' | 'mapping' | 'werte' | null;
}

const clean = (s: string | undefined) =>
    s
        ?.replace(/--+$/, '')
        .replace(/[[\]]/g, '')
        .replace(/[:.\s]+$/, '')
        .trim() || null;

// Entfernt, was von Datensatz zu Datensatz wechselt: Salesforce-Ids, Werte in Anführungszeichen, Zahlen.
export function normalizeMessage(raw: string): string {
    return raw
        .replace(
            /\b(?=[0-9a-zA-Z]*\d)(?=[0-9a-zA-Z]*[a-zA-Z])[0-9a-zA-Z]{15}(?:[0-9a-zA-Z]{3})?\b/g,
            '<Id>'
        )
        .replace(/'[^']*'|"[^"]*"/g, '„…“')
        .replace(/\d+/g, '#')
        .replace(/--+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Bekannte Adress-Labels auf den API-Namen abbilden, sonst nur wenn das Feld schon wie ein API-Name aussieht.
export function apiFieldOf(field: string | null): string | null {
    if (!field) return null;
    const address = field.match(
        /^(Billing|Shipping|Mailing|Other)\s+(State|Country|Postal Code|City|Street)/i
    );
    if (address) {
        const part = address[2]!
            .toLowerCase()
            .replace(/^./, (c) => c.toUpperCase())
            .replace(' ', '');
        return `${address[1]}${part}`;
    }
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(field) ? field : null;
}

interface Rule {
    category: TodoCategory;
    test: RegExp; // erste Gruppe: betroffenes Feld
    suggestion: (field: string) => string;
    step: Classified['step'];
}

const RULES: Rule[] = [
    {
        category: 'state-needs-country',
        test: /country\/territory must be specified before specifying a state value for field:\s*(.+)$/i,
        suggestion: (f) =>
            `Quelle prüfen: ${f} ist gefüllt, aber das Land fehlt. Land ergänzen oder State auslassen.`,
        step: 'werte'
    },
    {
        category: 'state-invalid',
        test: /problem with this state.*valid states\.?:\s*(.+)$/i,
        suggestion: (f) =>
            `Wert von ${f} ist im Ziel keine gültige State-Auswahl. Wertemapping anlegen (Quellwert → gültiger Wert) oder State/Country-Picklists im Ziel prüfen.`,
        step: 'werte'
    },
    {
        category: 'picklist',
        test: /(?:INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST|bad value for restricted picklist)(?:.*?field:\s*([\w ]+?))?(?::|--|$)/i,
        suggestion: (f) =>
            `Picklist-Wert existiert im Ziel nicht. Wertemapping für ${f} anlegen oder den Wert im Ziel ergänzen.`,
        step: 'werte'
    },
    {
        category: 'required',
        test: /(?:REQUIRED_FIELD_MISSING|Required fields are missing)\W*(?:Required fields are missing:\s*)?\[?([^\]:]+?)\]?(?::|--|$)/i,
        suggestion: (f) =>
            `Pflichtfeld ${f} hat keinen Wert. Quellfeld in Query und Mapping aufnehmen oder Standardwert per Wertemapping setzen.`,
        step: 'mapping'
    },
    {
        category: 'validation',
        test: /FIELD_CUSTOM_VALIDATION_EXCEPTION:?\s*(.*)$/i,
        suggestion: () =>
            'Eine Validierungsregel im Ziel lehnt den Datensatz ab. Regel prüfen, für die Migration vorübergehend deaktivieren oder die Daten anpassen.',
        step: null
    },
    {
        category: 'duplicate',
        test: /(?:DUPLICATE_VALUE|DUPLICATES_DETECTED|duplicate value found)[^:]*:?\s*([\w ]+)?/i,
        suggestion: () =>
            'Der Datensatz existiert im Ziel schon. External ID und Operation (Upsert) prüfen oder Duplikate in der Quelle bereinigen.',
        step: 'query'
    },
    {
        category: 'too-long',
        test: /(?:STRING_TOO_LONG|data value too large):?\s*([\w ]+?):/i,
        suggestion: (f) =>
            `Wert von ${f} ist länger als im Ziel erlaubt. Feldlänge im Ziel prüfen oder Quelldaten kürzen.`,
        step: 'mapping'
    },
    {
        category: 'lookup',
        test: /INVALID_CROSS_REFERENCE_KEY:?\s*([^:]*)/i,
        suggestion: () =>
            'Der Verweis zeigt auf einen Datensatz, der im Ziel fehlt oder nicht passt. Parent zuerst migrieren und Parent-Modus der Query prüfen.',
        step: 'query'
    },
    {
        category: 'lock',
        test: /UNABLE_TO_LOCK_ROW()/i,
        suggestion: () =>
            'Zeile war gesperrt (parallele Verarbeitung). Lauf wiederholen oder die Batchgröße senken.',
        step: null
    }
];

export function classifyError(raw: string): Classified {
    const message = normalizeMessage(raw);
    for (const rule of RULES) {
        const m = raw.match(rule.test);
        if (!m) continue;
        const field = clean(m[1]);
        return {
            category: rule.category,
            field,
            apiField: apiFieldOf(field),
            message,
            suggestion: rule.suggestion(field ?? 'das Feld'),
            step: rule.step
        };
    }
    return {
        category: 'other',
        field: null,
        apiField: null,
        message,
        suggestion: 'Meldung prüfen; kein bekanntes Muster. Gegebenenfalls eine Regel ergänzen.',
        step: null
    };
}
