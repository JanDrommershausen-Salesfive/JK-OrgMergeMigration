// Emoji je Feldtyp, damit man in langen Feldlisten schnell erkennt, was ein Feld ist.
const EMOJI: Record<string, string> = {
    string: '🔤',
    textarea: '🔤',
    email: '🔤',
    phone: '🔤',
    url: '🔤',
    picklist: '🔽',
    multipicklist: '🔽',
    combobox: '🔽',
    boolean: '✅',
    int: '🔢',
    double: '🔢',
    currency: '🔢',
    percent: '🔢',
    date: '🗓️',
    datetime: '🗓️',
    time: '🗓️',
    reference: '🔗',
    id: '🆔',
    address: '📍',
    location: '📍',
    base64: '📎',
    encryptedstring: '🔒'
};

export const typeEmoji = (baseType: string | undefined): string => EMOJI[baseType ?? ''] ?? '❔';

export const TYPE_NAMES: Record<string, string> = {
    '🔤': 'Text',
    '🔽': 'Auswahlliste',
    '✅': 'Ja/Nein',
    '🔢': 'Zahl',
    '🗓️': 'Datum',
    '🔗': 'Verweis (Lookup)',
    '🆔': 'Id',
    '📍': 'Adresse/Ort',
    '📎': 'Datei',
    '🔒': 'Verschlüsselt',
    '❔': 'Sonstiges'
};
