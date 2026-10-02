import type { DescribeResult } from '@studio/shared';
import { sf } from './sf';

const TTL_MS = 10 * 60 * 1000;

interface SfField {
    name: string;
    type: string;
    label: string;
    length?: number;
    precision?: number;
    scale?: number;
    referenceTo?: string[];
    createable: boolean;
    updateable: boolean;
}

// Vergleichbarer Typtext. Polymorphe Referenzlisten unterscheiden sich je Org und sind nicht vergleichbar.
export function fieldType(f: SfField): string {
    if (f.type === 'reference') {
        const t = f.referenceTo ?? [];
        return t.length > 1 ? `reference(${t.length} Objekte)` : `reference(${t[0] ?? ''})`;
    }
    if (f.type === 'double' || f.type === 'currency' || f.type === 'percent') {
        return `${f.type}(${f.precision},${f.scale})`;
    }
    const withLength = ['string', 'textarea', 'phone', 'email', 'url', 'picklist', 'multipicklist'];
    if (withLength.includes(f.type) && f.length) return `${f.type}(${f.length})`;
    return f.type;
}

export class DescribeCache {
    private cache = new Map<string, { at: number; result: DescribeResult }>();

    async describe(alias: string, object: string, refresh = false): Promise<DescribeResult> {
        const key = `${alias}:${object}`;
        const hit = this.cache.get(key);
        if (hit && !refresh && Date.now() - hit.at < TTL_MS) return hit.result;

        const r = await sf(['sobject', 'describe', '-s', object, '-o', alias]);
        if (r.status === 0 && Array.isArray(r.result?.fields)) {
            const fields: Record<string, DescribeFieldOut> = {};
            for (const f of r.result.fields as SfField[]) {
                fields[f.name] = {
                    type: fieldType(f),
                    baseType: f.type,
                    label: f.label,
                    createable: f.createable,
                    updateable: f.updateable
                };
            }
            const result: DescribeResult = { ok: true, fields };
            this.cache.set(key, { at: Date.now(), result });
            return result;
        }
        const error = (r.message || 'Describe fehlgeschlagen').split('\n')[0] ?? '';
        return { ok: false, error };
    }
}

type DescribeFieldOut = Extract<DescribeResult, { ok: true }>['fields'][string];
