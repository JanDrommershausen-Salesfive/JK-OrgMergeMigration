import { useObject, useQueryModel } from '../../api/queries';
import type { Report } from '../detail/saveMessage';
import { ValuesTab } from './ValuesTab';

interface EntryProps {
    folder: string;
    parentIndex?: number;
    filterField: string | null;
    running: boolean;
    report: Report;
    onFilterChange: (field: string | null) => void;
}

function EntryValues({
    folder,
    parentIndex,
    filterField,
    running,
    report,
    onFilterChange
}: EntryProps) {
    const detail = useObject(folder, parentIndex);
    if (detail.error)
        return (
            <p role="alert" className="text-bad">
                {detail.error.message}
            </p>
        );
    if (!detail.data) return <p className="text-grey-500">Lade …</p>;
    return (
        <ValuesTab
            detail={detail.data}
            filterField={filterField}
            running={running}
            report={report}
            onFilterChange={onFilterChange}
        />
    );
}

interface Props {
    folder: string;
    object: string;
    filterField: string | null;
    running: boolean;
    report: Report;
    onFilterChange: (field: string | null) => void;
}

// Schritt 3: Werte ersetzen, getrennt je Objekt. Das Hauptobjekt zuerst, danach je ein Abschnitt für
// jeden Parent, der im Lauf mitgezogen wird (seine Zeilen stehen in derselben Datei dieses Ordners).
export function ValuesPage({
    folder,
    object,
    filterField,
    running,
    report,
    onFilterChange
}: Props) {
    const model = useQueryModel(folder);
    const pulled = (model.data?.parents ?? []).filter((p) => p.mode === 'pull');

    return (
        <div className="space-y-8">
            <section>
                <h3 className="mb-2 text-sm font-bold">{object} · Hauptobjekt</h3>
                <EntryValues
                    folder={folder}
                    filterField={filterField}
                    running={running}
                    report={report}
                    onFilterChange={onFilterChange}
                />
            </section>
            {pulled.map((p) => (
                <section key={`${p.index}-${p.object}`} aria-label={`${p.object} (mitgezogen)`}>
                    <h3 className="mb-1 text-sm font-bold">{p.object} (mitgezogen)</h3>
                    <EntryValues
                        folder={folder}
                        parentIndex={p.index}
                        filterField={null}
                        running={running}
                        report={report}
                        onFilterChange={() => undefined}
                    />
                </section>
            ))}
        </div>
    );
}
