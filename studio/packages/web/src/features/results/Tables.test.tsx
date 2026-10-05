import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ErrorsTable } from './Tables';

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
