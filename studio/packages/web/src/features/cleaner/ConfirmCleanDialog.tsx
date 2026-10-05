import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';

interface Props {
    open: boolean;
    alias: string;
    total: number;
    creator: 'me' | 'any';
    pending: boolean;
    error: string | null;
    onClose: () => void;
    onConfirm: (hardDelete: boolean) => void;
}

// Löschen verlangt, den Alias der Ziel-Org einzutippen (wie beim Live-Lauf).
export function ConfirmCleanDialog({
    open,
    alias,
    total,
    creator,
    pending,
    error,
    onClose,
    onConfirm
}: Props) {
    const [typed, setTyped] = useState('');
    const [hard, setHard] = useState(true);
    const close = () => {
        setTyped('');
        onClose();
    };

    return (
        <Dialog open={open} title={`Daten in ${alias} löschen`} onClose={close}>
            <p className="mb-3 text-sm">
                Es werden <b>{total}</b> Datensätze in <b>{alias}</b> gelöscht
                {creator === 'any'
                    ? ', darunter auch Daten, die nicht von dir angelegt wurden'
                    : ''}
                . Das lässt sich nicht rückgängig machen.
            </p>
            <label className="mb-4 flex cursor-pointer items-start gap-2 text-[13px]">
                <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={hard}
                    onChange={(e) => setHard(e.target.checked)}
                />
                <span>
                    Endgültig löschen (Hard Delete). Umgeht den Papierkorb und macht die Datensätze
                    sofort frei. Papierkorb-Einträge zählen zwar nicht zum Datenspeicher, bremsen
                    aber die Datenbank bei großen Mengen. Fehlt die Berechtigung „Bulk API Hard
                    Delete“, wird normal gelöscht.
                </span>
            </label>
            <label className="block text-sm">
                <span className="mb-1 block font-bold">
                    Zur Bestätigung den Alias eingeben: {alias}
                </span>
                <input
                    className="w-full rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    aria-label="Alias bestätigen"
                    autoComplete="off"
                />
            </label>
            {error && (
                <p role="alert" className="mt-3 text-[13px] text-bad">
                    {error}
                </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
                <Button variant="ghost" onClick={close}>
                    Abbrechen
                </Button>
                <Button
                    variant="danger"
                    disabled={typed !== alias || pending || total === 0}
                    onClick={() => onConfirm(hard)}
                >
                    {pending ? 'Starte …' : `Jetzt in ${alias} löschen`}
                </Button>
            </div>
        </Dialog>
    );
}
