import { describe, expect, it } from 'vitest';
import { typeEmoji } from './fieldType';

describe('typeEmoji', () => {
    it('ordnet Feldtypen ihren Emojis zu', () => {
        expect(typeEmoji('double')).toBe('🔢');
        expect(typeEmoji('boolean')).toBe('✅');
        expect(typeEmoji('picklist')).toBe('🔽');
        expect(typeEmoji('datetime')).toBe('🗓️');
        expect(typeEmoji('string')).toBe('🔤');
        expect(typeEmoji('reference')).toBe('🔗');
    });

    it('fällt bei unbekannten Typen auf ein Fragezeichen zurück', () => {
        expect(typeEmoji('anyType')).toBe('❔');
        expect(typeEmoji(undefined)).toBe('❔');
    });
});
