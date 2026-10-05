import { useQueryModel } from '../../api/queries';
import type { Report } from '../detail/saveMessage';
import { EntryMapping } from './EntryMapping';

interface Props {
    folder: string;
    object: string;
    onlyDiff: boolean;
    running: boolean;
    report: Report;
    onOpenValueMapping: (field: string) => void;
}

// Schritt 2: Wie wandern die gelesenen Felder ins Ziel? Zuerst das Objekt selbst, danach je ein
// Abschnitt für jeden Parent, der im Lauf mitgezogen wird.
export function MappingTab({
    folder,
    object,
    onlyDiff,
    running,
    report,
    onOpenValueMapping
}: Props) {
    const model = useQueryModel(folder);
    const pulled = (model.data?.parents ?? []).filter((p) => p.mode === 'pull');

    return (
        <div className="space-y-8">
            <section>
                <h3 className="mb-2 text-sm font-bold">{object} · Hauptobjekt</h3>
                <EntryMapping
                    folder={folder}
                    onlyDiff={onlyDiff}
                    running={running}
                    report={report}
                    onOpenValueMapping={onOpenValueMapping}
                />
            </section>
            {pulled.map((p) => (
                <section key={`${p.index}-${p.object}`} aria-label={`${p.object} (mitgezogen)`}>
                    <h3 className="mb-1 text-sm font-bold">{p.object} (mitgezogen)</h3>
                    <p className="mb-2 text-[13px] text-grey-500">
                        {p.object} wird im Lauf im Ziel angelegt, wenn es dort fehlt. Hier legst du
                        fest, wohin seine Felder gehen.
                    </p>
                    <EntryMapping
                        folder={folder}
                        parentIndex={p.index}
                        onlyDiff={onlyDiff}
                        running={running}
                        report={report}
                    />
                </section>
            ))}
        </div>
    );
}
