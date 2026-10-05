import type { PresetInfo } from '@studio/shared';
import { useState } from 'react';
import {
    useDeletePreset,
    usePresetDiff,
    usePresets,
    useRestorePreset,
    useSavePreset
} from '../../api/queries';
import { Button, Tag } from '../../components/ui';
import type { Report } from '../detail/saveMessage';
import { RestoreDialog } from './RestoreDialog';

const input = 'rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm';
const when = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

function Compare({ folder, id }: { folder: string; id: string }) {
    const diff = usePresetDiff(folder, id);
    if (diff.isPending) return <p className="mt-2 text-[13px] text-grey-500">Vergleiche …</p>;
    if (diff.error)
        return (
            <p role="alert" className="mt-2 text-[13px] text-bad">
                {diff.error.message}
            </p>
        );
    const changes = diff.data?.changes ?? [];
    return changes.length === 0 ? (
        <p className="mt-2 text-[13px] text-grey-500">Kein Unterschied zum aktuellen Stand.</p>
    ) : (
        <div className="mt-2 text-[13px]">
            <p className="mb-1 text-grey-500">Beim Laden ändert sich:</p>
            <ul className="m-0 list-disc pl-5">
                {changes.map((c, i) => (
                    <li key={i}>{c.text}</li>
                ))}
            </ul>
        </div>
    );
}

// Versionen der Konfiguration eines Objekts: bewusst gespeicherte Stände (export.json und ValueMapping.csv),
// jederzeit vergleichbar und ladbar.
export function VersionsTab({
    folder,
    running,
    report
}: {
    folder: string;
    running: boolean;
    report: Report;
}) {
    const presets = usePresets(folder);
    const save = useSavePreset(folder);
    const del = useDeletePreset(folder);
    const restore = useRestorePreset(folder);
    const [name, setName] = useState('');
    const [note, setNote] = useState('');
    const [comparing, setComparing] = useState<string | null>(null);
    const [loading, setLoading] = useState<PresetInfo | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const list = presets.data?.presets ?? [];

    return (
        <div>
            <section className="mb-6 rounded-xl border border-grey-line p-4">
                <h3 className="mb-2 text-sm font-bold">Aktuellen Stand speichern</h3>
                <p className="mb-3 text-[13px] text-grey-500">
                    Sichert Query, Mapping und Wertemapping dieses Objekts als benannte Version
                    unter <span className="font-mono">{folder}/presets/</span>. Die Stände liegen im
                    Projekt und gehören ins Git.
                </p>
                <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        save.mutate(
                            { folder, name, note },
                            {
                                onSuccess: (p) => {
                                    setName('');
                                    setNote('');
                                    report(`✓ Stand „${p.name}“ gespeichert`);
                                },
                                onError: (err) => report(err.message, true)
                            }
                        );
                    }}
                >
                    <label className="text-xs text-grey-500">
                        Name
                        <input
                            className={`${input} mt-1 block w-64`}
                            value={name}
                            required
                            maxLength={60}
                            placeholder="z. B. Länder gemappt, läuft"
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    <label className="min-w-64 flex-1 text-xs text-grey-500">
                        Notiz (optional)
                        <input
                            className={`${input} mt-1 block w-full`}
                            value={note}
                            maxLength={500}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </label>
                    <Button type="submit" disabled={save.isPending || !name.trim()}>
                        Speichern
                    </Button>
                </form>
            </section>

            <h3 className="mb-2 text-sm font-bold">Gespeicherte Stände ({list.length})</h3>
            {presets.isPending && <p className="text-[13px] text-grey-500">Lade …</p>}
            {presets.data && list.length === 0 && (
                <p className="text-[13px] text-grey-500">Noch keine Stände gespeichert.</p>
            )}
            <ul className="m-0 list-none p-0">
                {list.map((p) => (
                    <li key={p.id} className="mb-2 rounded-xl border border-grey-line px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{p.name}</span>
                            {p.matchesCurrent && <Tag tone="ok">= aktuell</Tag>}
                            {p.source === 'backup' && <Tag>Backup</Tag>}
                            {!p.hasValueMapping && <Tag>ohne Wertemapping</Tag>}
                            <span className="text-[13px] text-grey-500">{when(p.createdAt)}</span>
                            <span className="flex-1" />
                            <Button
                                variant="ghost"
                                small
                                onClick={() => setComparing(comparing === p.id ? null : p.id)}
                            >
                                {comparing === p.id ? 'Vergleich schließen' : 'Vergleichen'}
                            </Button>
                            <Button
                                small
                                disabled={running || p.matchesCurrent}
                                title={
                                    p.matchesCurrent ? 'Ist schon der aktuelle Stand' : undefined
                                }
                                onClick={() => setLoading(p)}
                            >
                                Laden …
                            </Button>
                            {confirmDelete === p.id ? (
                                <>
                                    <Button
                                        small
                                        variant="danger"
                                        disabled={del.isPending}
                                        onClick={() =>
                                            del.mutate(p.id, {
                                                onSuccess: () => setConfirmDelete(null),
                                                onError: (err) => report(err.message, true)
                                            })
                                        }
                                    >
                                        Wirklich löschen
                                    </Button>
                                    <Button
                                        small
                                        variant="ghost"
                                        onClick={() => setConfirmDelete(null)}
                                    >
                                        Abbrechen
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="ghost"
                                    small
                                    onClick={() => setConfirmDelete(p.id)}
                                >
                                    Löschen
                                </Button>
                            )}
                        </div>
                        {p.note && <p className="mt-1 mb-0 text-[13px] text-grey-500">{p.note}</p>}
                        {comparing === p.id && <Compare folder={folder} id={p.id} />}
                    </li>
                ))}
            </ul>

            <RestoreDialog
                folder={folder}
                preset={loading}
                pending={restore.isPending}
                error={restore.error?.message ?? null}
                onClose={() => {
                    setLoading(null);
                    restore.reset();
                }}
                onRestore={(backupName) =>
                    loading &&
                    restore.mutate(
                        { folder, id: loading.id, backupName: backupName ?? undefined },
                        {
                            onSuccess: ({ backup }) => {
                                report(
                                    `✓ Stand „${loading.name}“ geladen${backup ? `, vorher gesichert als „${backup.name}“` : ''}`
                                );
                                setLoading(null);
                            }
                        }
                    )
                }
            />
        </div>
    );
}
