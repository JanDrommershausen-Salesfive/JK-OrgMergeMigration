import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorsTable } from './Tables';

vi.mock('../../api/queries', () => ({
    useErrorRecord: () => ({
        isPending: false,
        error: null,
        data: { fields: { Name: 'A', BillingStreet: '#N/A', Phone: '123' } }
    })
}));

const rows = ['A', 'B', 'C'].map((label) => ({
    file: 'insert',
    id: '#N/A',
    oldId: `001${label}`,
    label,
    error: `Fehler ${label}`
}));

function Harness({ onPick }: { onPick: (s: Set<number>) => void }) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    return (
        <ErrorsTable
            rows={rows}
            total={3}
            selection={{
                selected,
                onChange: (n) => {
                    setSelected(n);
                    onPick(n);
                }
            }}
        />
    );
}

describe('ErrorsTable Auswahl', () => {
    it('wählt einzelne Fehler und behält die Position beim Filtern', async () => {
        let last = new Set<number>();
        render(<Harness onPick={(s) => (last = s)} />);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Fehler von A wählen' }));
        expect([...last]).toEqual([0]);
        await userEvent.type(screen.getByRole('searchbox'), 'Fehler C');
        await userEvent.click(screen.getByRole('checkbox', { name: 'Fehler von C wählen' }));
        expect([...last].sort()).toEqual([0, 2]);
    });

    it('wählt alle angezeigten Fehler auf einmal', async () => {
        let last = new Set<number>();
        render(<Harness onPick={(s) => (last = s)} />);
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Alle angezeigten Fehler wählen' })
        );
        expect([...last].sort()).toEqual([0, 1, 2]);
    });
});

describe('ErrorsTable gesendete Felder', () => {
    it('klappt alle gesendeten Felder einer Zeile auf und zu', async () => {
        render(<ErrorsTable rows={rows} total={3} run={{ folder: '010_Account', id: 'x' }} />);
        expect(screen.queryByText('BillingStreet')).toBeNull();
        await userEvent.click(screen.getAllByRole('button', { name: 'Alle Felder' })[0]!);
        expect(screen.getByText('BillingStreet')).toBeTruthy();
        expect(screen.getByText('123')).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Ausblenden' }));
        expect(screen.queryByText('BillingStreet')).toBeNull();
    });

    it('zeigt ohne Lauf keine Spalte "Felder"', () => {
        render(<ErrorsTable rows={rows} total={3} />);
        expect(screen.queryByRole('button', { name: 'Alle Felder' })).toBeNull();
    });
});
