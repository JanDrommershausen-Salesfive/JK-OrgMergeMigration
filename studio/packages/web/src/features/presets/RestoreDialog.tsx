import type { PresetInfo } from '@studio/shared';
import { useState } from 'react';
import { usePresetDiff } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';

interface Props {
    folder: string;
    preset: PresetInfo | null; // null: Dialog geschlossen
    pending: boolean;
    error: string | null;
    onClose: () => void;
    onRestore: (backupName: string | null) => void;
}

// Stand laden: zeigt, was sich ändert, und fragt, ob der aktuelle Stand vorher gesichert werden soll.
export function RestoreDialog({ folder, preset, pending, error, onClose, onRestore }: Props) {
    const diff = usePresetDiff(folder, preset?.id ?? null);
    const [backup, setBackup] = useState(true);
    const [name, setName] = useState('');
    const defaultName = `Vor dem Laden von ${preset?.name ?? ''}`.slice(0, 60);
    const changes = diff.data?.changes ?? [];

    return (
        <Dialog
            open={preset !== null}
            title={`Stand laden: ${preset?.name ?? ''}`}
            onClose={onClose}
        >
            <h3 className="mb-2 text-sm font-bold">Das ändert sich</h3>
            {diff.isPending && <p className="text-[13px] text-grey-500">Vergleiche …</p>}
            {diff.error && (
                <p role="alert" className="text-[13px] text-bad">
                    {diff.error.message}
                </p>
            )}
            {diff.data && changes.length === 0 && (
                <p className="text-[13px] text-grey-500">
                    Nichts: der aktuelle Stand ist identisch.
                </p>
            )}
            {changes.length > 0 && (
                <ul className="m-0 mb-4 max-h-56 list-disc overflow-auto pl-5 text-[13px]">
                    {changes.map((c, i) => (
                        <li key={i}>{c.text}</li>
                    ))}
                </ul>
            )}
            <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-bold">Aktuellen Stand vorher sichern?</legend>
                <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                        type="radio"
                        name="backup"
                        className="mt-1"
                        checked={backup}
                        onChange={() => setBackup(true)}
                    />
                    <span>
                        Ja, als Stand speichern
                        <input
                            aria-label="Name der Sicherung"
                            className="mt-1 block w-full rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm"
                            placeholder={defaultName}
                            value={name}
                            disabled={!backup}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                        type="radio"
                        name="backup"
                        className="mt-1"
                        checked={!backup}
                        onChange={() => setBackup(false)}
                    />
                    <span>
                        Nein, nicht sichern
                        <span className="block text-[13px] text-bad">
                            Der aktuelle Stand geht verloren, falls er nicht schon gespeichert ist.
                        </span>
                    </span>
                </label>
            </fieldset>
            {error && (
                <p role="alert" className="mt-3 text-[13px] text-bad">
                    {error}
                </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>
                    Abbrechen
                </Button>
                <Button
                    disabled={pending}
                    onClick={() => onRestore(backup ? name.trim() || defaultName : null)}
                >
                    {pending ? 'Lade …' : 'Stand laden'}
                </Button>
            </div>
        </Dialog>
    );
}
