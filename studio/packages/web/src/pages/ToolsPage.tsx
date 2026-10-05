import { Link } from 'react-router';

interface Tool {
    title: string;
    text: string;
    to?: string; // ohne Ziel: noch nicht gebaut
}

const TOOLS: Tool[] = [
    {
        title: 'Org Cleaner',
        text: 'Leert die Ziel-Sandbox von migrierten Daten, in der richtigen Reihenfolge und mit Blick auf Abhängigkeiten wie Cases, Orders und Entitlements am Account.',
        to: '/tools/org-cleaner'
    },
    {
        title: 'Org-Limits',
        text: 'API-Aufrufe, Bulk-Batches, Daten- und Dateispeicher von Quelle und Ziel, vor einem Lauf oder Löschen.',
        to: '/tools/limits'
    },
    {
        title: 'Query-Editor',
        text: 'Lesende Abfrage gegen Quelle oder Ziel: Feldwerte ziehen, deduplizieren und als Wertemapping übernehmen.',
        to: '/tools/query'
    },
    {
        title: 'Migration To-Do',
        text: 'Fehler aus den Läufen, nach Ursache zusammengefasst, mit Lösungsvorschlag und Status.',
        to: '/tools/todos'
    },
    {
        title: 'Mapping-Export',
        text: 'Mapping und Wertemapping als Dokument für die Fachseite exportieren.'
    },
    { title: 'Log-Suche', text: 'Fehlermeldungen über alle archivierten Läufe durchsuchen.' }
];

// Werkzeuge, die nicht direkt zu SFDMU gehören.
export function ToolsPage() {
    return (
        <>
            <h2 className="mb-1 text-xl font-normal tracking-tighter">Tools</h2>
            <p className="mb-5 text-[13px] text-grey-500">
                Hilfsmittel rund um die Migration, die nicht direkt zu SFDMU gehören.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TOOLS.map((t) =>
                    t.to ? (
                        <Link
                            key={t.title}
                            to={t.to}
                            className="block rounded-xl border border-grey-line bg-white p-5 hover:border-digital-blue"
                        >
                            <h3 className="mb-1 text-base font-bold">{t.title}</h3>
                            <p className="m-0 text-[13px] text-grey-500">{t.text}</p>
                        </Link>
                    ) : (
                        <div
                            key={t.title}
                            aria-disabled="true"
                            className="rounded-xl border border-dashed border-grey-line bg-white/60 p-5 opacity-70"
                        >
                            <h3 className="mb-1 flex items-center gap-2 text-base font-bold">
                                {t.title}
                                <span className="rounded-full bg-grey-100 px-2 text-xs font-normal text-grey-500">
                                    bald
                                </span>
                            </h3>
                            <p className="m-0 text-[13px] text-grey-500">{t.text}</p>
                        </div>
                    )
                )}
            </div>
        </>
    );
}
