import { describe, expect, it } from 'vitest';
import { fieldType } from './describe';

const base = { name: 'x', label: 'X', createable: true, updateable: true };

describe('fieldType', () => {
    it('fasst polymorphe Referenzen zusammen', () => {
        expect(fieldType({ ...base, type: 'reference', referenceTo: ['User', 'Group'] })).toBe(
            'reference(2 Objekte)'
        );
    });

    it('zeigt Länge bei Textfeldern und Präzision bei Zahlen', () => {
        expect(fieldType({ ...base, type: 'string', length: 80 })).toBe('string(80)');
        expect(fieldType({ ...base, type: 'currency', precision: 18, scale: 2 })).toBe(
            'currency(18,2)'
        );
    });
});
