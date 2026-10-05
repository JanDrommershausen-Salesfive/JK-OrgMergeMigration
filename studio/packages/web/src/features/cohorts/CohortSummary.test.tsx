import type { Cohort } from '@studio/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompositionCard } from './CohortSummary';

const base = {
    id: 'x',
    name: 'N',
    createdAt: '2026-10-02T19:03:20Z',
    rootObject: 'Account',
    ids: [],
    count: 50
};

describe('CompositionCard', () => {
    it('nennt Stichprobe und Filterbedingungen', () => {
        const cohort = {
            ...base,
            rule: {
                kind: 'sample',
                size: 50,
                filters: [
                    { field: 'BillingState', op: '=', value: { kind: 'string', value: 'CA' } },
                    { field: 'Type', op: '!=', value: { kind: 'null' } }
                ]
            }
        } as Cohort;
        render(<CompositionCard cohort={cohort} />);
        expect(screen.getByText('Zufällige Stichprobe: 50 Account')).toBeInTheDocument();
        expect(screen.getByText('BillingState = „CA“')).toBeInTheDocument();
        expect(screen.getByText('Type != leer')).toBeInTheDocument();
        expect(screen.queryByText(/Ohne Filter/)).not.toBeInTheDocument();
    });

    it('beschreibt eine feste Id-Liste', () => {
        const cohort = {
            ...base,
            count: 30,
            rule: { kind: 'ids', ids: Array.from({ length: 30 }, (_, i) => `001${i}`) }
        } as Cohort;
        render(<CompositionCard cohort={cohort} />);
        expect(screen.getByText('Feste Liste: 30 Account-Ids')).toBeInTheDocument();
    });
});
