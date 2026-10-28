import { useRef, useState } from 'react';
import { useMappingFiles, useSelectMappingFile, useUploadMappingFile } from '../../api/queries';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import type { Report } from '../detail/saveMessage';

const fileName = (file: string) => file.split('/').pop() ?? file;
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

// Welche Excel-Datei liefert die Picklist-Werte? Gilt für das ganze Projekt (mapping.config.json).
export function MappingFilePicker({ running, report }: { running: boolean; report: Report }) {
    const files = useMappingFiles();
    const select = useSelectMappingFile();
    const upload = useUploadMappingFile();
    const input = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState<File | null>(null); // gleichnamige Datei: erst fragen
    const data = files.data;
    const busy = running || select.isPending || upload.isPending;

    const send = (file: File, replace: boolean) => {
        setPending(null);
        report(`Lege ${file.name} in Mappings/ ab …`);
        upload.mutate(
            { file, replace },
            {
                onSuccess: () => report(`✓ ${file.name} in Mappings/ abgelegt und gewählt`),
                onError: (e) => {
                    if ((e as { status?: number }).status === 409) {
                        report('');
                        setPending(file);
                    } else report(e.message, true);
                }
            }
        );
    };

    const choose = (file: string) => {
        report('Speichere …');
        select.mutate(
            { file: file || null },
            {
                onSuccess: () =>
                    report(
                        file
                            ? `✓ Mapping-Datei: ${fileName(file)}`
                            : '✓ Keine Mapping-Datei, Werte werden nicht mehr übernommen'
                    ),
                onError: (e) => report(e.message, true)
            }
        );
    };

    return (
        <div className="rounded-xl border border-grey-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="mapping-file" className="text-sm font-bold">
                    Mapping-Datei
                </label>
                <select
                    id="mapping-file"
                    value={data?.selected ?? ''}
                    onChange={(e) => choose(e.target.value)}
                    disabled={busy || !data}
                    className="w-full max-w-[480px] rounded-lg border border-grey-line bg-white px-1.5 py-1 text-[13px] text-ink"
                >
                    <option value="">
                        {data?.files.length
                            ? 'Keine (nichts übernehmen)'
                            : 'Keine .xlsx in Mappings/'}
                    </option>
                    {data?.selected && !data.files.some((f) => f.file === data.selected) && (
                        <option value={data.selected}>{fileName(data.selected)} (fehlt)</option>
                    )}
                    {data?.files.map((f) => (
                        <option key={f.file} value={f.file} disabled={!f.usable}>
                            {fileName(f.file)} · {day(f.modified)}
                            {f.usable ? '' : ` · ${f.problem}`}
                        </option>
                    ))}
                </select>
                <Button
                    small
                    variant="ghost"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                    title="Excel-Datei von diesem Rechner wählen; sie wird nach Mappings/ kopiert und gewählt"
                >
                    {upload.isPending ? 'Lädt hoch …' : 'Select file'}
                </Button>
                <input
                    ref={input}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    aria-label="Excel-Datei wählen"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = ''; // dieselbe Datei später erneut wählbar
                        if (file) send(file, false);
                    }}
                />
                <button
                    type="button"
                    className="cursor-pointer text-[13px] text-digital-blue hover:underline disabled:opacity-40"
                    onClick={() => void files.refetch()}
                    disabled={files.isFetching}
                    title="Mappings/ neu einlesen, zum Beispiel nach dem Ablegen einer neuen Datei"
                >
                    {files.isFetching ? 'Liest …' : '↻ Liste neu laden'}
                </button>
            </div>
            <p className="mt-2 mb-0 text-[13px] text-grey-500">
                {files.error
                    ? files.error.message
                    : data?.selected
                      ? 'Kommt ein Picklist-Feld in die Query, übernimmt die Studio seine Werte aus dem Blatt „Picklist Mapping“ dieser Datei. Vorhandene Zeilen bleiben unverändert.'
                      : 'Ohne gewählte Datei übernimmt die Studio keine Werte automatisch.'}
            </p>
            <Dialog
                open={pending !== null}
                title="Datei ersetzen?"
                onClose={() => setPending(null)}
            >
                <p className="mb-4 text-sm">
                    In Mappings/ liegt schon eine Datei{' '}
                    <span className="font-mono">{pending?.name}</span>. Soll die gewählte Datei sie
                    ersetzen? Die alte Fassung bleibt nur in Git erhalten, wenn sie committet ist.
                </p>
                <div className="flex justify-end gap-2">
                    <Button small variant="ghost" onClick={() => setPending(null)}>
                        Abbrechen
                    </Button>
                    <Button small onClick={() => pending && send(pending, true)}>
                        Ersetzen
                    </Button>
                </div>
            </Dialog>
        </div>
    );
}
