import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useObjects, useQuickQuery } from '../api/queries';
import { Button, Panel } from '../components/ui';
import { distinctValues, newMappingRows } from '../features/quick/distinct';

const field = 'rounded-lg border border-grey-line bg-white px-2 py-1.5 text-sm';
const SHOWN = 200;

// Wertemapping anlegen aus den Werten einer Spalte: neue Quellwerte kommen mit gleichem Zielwert dazu,
// bestehende Regeln bleiben unverändert.
function ToValueMapping({
    column,
    values
}: {
    column: string;
    values: ReturnType<typeof distinctValues>;
}) {
    const objects = useObjects();
    const [folder, setFolder] = useState('');
    const [target, setTarget] = useState(column);
    const [message, setMessage] = useState<{ text: string; error: boolean; link?: string } | null>(
        null
    );
    const [busy, setBusy] = useState(false);

    const apply = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const detail = await api.object(folder);
            const existing = detail.valueMappings
                .filter((r) => r.field === target)
                .map((r) => ({ from: r.from, to: r.to }));
            const added = newMappingRows(values, existing);
            if (!added.length) {
                setMessage({ text: 'Alle Werte haben schon eine Regel.', error: false });
                return;
            }
            await api.setValueMapping({ folder, field: target, rows: [...existing, ...added] });
            setMessage({
                text: `${added.length} neue Quellwerte übernommen (Zielwert zunächst gleich). Im Wertemapping anpassen.`,
                error: false,
                link: `/konfiguration/${folder}/werte?feld=${encodeURIComponent(target)}`
            });
        } catch (e) {
            setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-4 rounded-xl border border-grey-line p-3 text-[13px]">
            <div className="mb-2 font-bold">In Wertemapping übernehmen</div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-grey-500">
                    Objekt
                    <select
                        className={`${field} mt-1 block`}
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                    >
                        <option value="">Wählen …</option>
                        {(objects.data?.objects ?? []).map((o) => (
                            <option key={o.folder} value={o.folder}>
                                {o.object}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-grey-500">
                    Feld
                    <input
                        className={`${field} mt-1 block w-48`}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                    />
                </label>
                <Button
                    small
                    disabled={!folder || !target.trim() || busy}
                    onClick={() => void apply()}
                >
                    Quellwerte übernehmen
                </Button>
            </div>
            {message && (
                <p
                    role={message.error ? 'alert' : 'status'}
                    className={`mt-2 mb-0 ${message.error ? 'text-bad' : 'text-ok'}`}
                >
                    {message.text}{' '}
                    {message.link && (
                        <Link className="font-bold underline" to={message.link}>
                            Zum Wertemapping
                        </Link>
                    )}
                </p>
            )}
        </div>
    );
}

// Freie, lesende Abfrage gegen Quelle oder Ziel, zum Beispiel um alle Werte eines Felds zu sehen und daraus ein
// Wertemapping zu bauen. Claude kann eine Abfrage vorschlagen; ausgeführt wird sie nur hier, durch die Person.
export function QuickQueryPage() {
    const [params] = useSearchParams();
    const objects = useObjects();
    const query = useQuickQuery();
    const [org, setOrg] = useState<'source' | 'target'>(
        params.get('org') === 'target' ? 'target' : 'source'
    );
    const [soql, setSoql] = useState(params.get('soql') ?? '');
    const [column, setColumn] = useState(0);
    const askedSoql = params.get('soql');
    const askedOrg = params.get('org');
    const askedAt = params.get('t'); // wechselt bei jedem Öffnen, auch wenn dieselbe Abfrage nochmal kommt

    // Ein Vorschlag aus dem Chat ändert die Adresse, während die Seite schon offen ist: Abfrage und Org übernehmen.
    useEffect(() => {
        if (askedSoql === null) return;
        setSoql(askedSoql);
        setOrg(askedOrg === 'target' ? 'target' : 'source');
        query.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei neuer Adresse; query.reset ist stabil genug
    }, [askedSoql, askedOrg, askedAt]);

    const result = query.data;
    const alias = (o: 'source' | 'target') =>
        (o === 'source' ? objects.data?.sourceAlias : objects.data?.targetAlias) ?? '';
    const values = result
        ? distinctValues(result.columns, result.rows, Math.min(column, result.columns.length - 1))
        : [];
    const col = result?.columns[Math.min(column, (result?.columns.length ?? 1) - 1)] ?? '';
    const run = () => soql.trim() && query.mutate({ org, soql }, { onSuccess: () => setColumn(0) });

    return (
        <>
            <p className="mb-2 text-[13px]">
                <Link className="text-digital-blue underline" to="/tools">
                    ← Tools
                </Link>
            </p>
            <h2 className="mb-1 text-xl font-normal tracking-tighter">Query-Editor</h2>
            <p className="mb-4 text-[13px] text-grey-500">
                Lesende Abfrage (nur SELECT) gegen Quelle oder Ziel, um Feldwerte zu ziehen und zu
                deduplizieren. Für Werte eines Felds eignet sich GROUP BY, zum Beispiel{' '}
                <span className="font-mono">
                    SELECT BillingState, COUNT(Id) FROM Account GROUP BY BillingState
                </span>
                .
            </p>
            <Panel label="Abfrage">
                <div className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                        <label className="text-sm">
                            Org{' '}
                            <select
                                aria-label="Org"
                                className={field}
                                value={org}
                                onChange={(e) => setOrg(e.target.value as 'source' | 'target')}
                            >
                                <option value="source">
                                    Quelle {alias('source') && `(${alias('source')})`}
                                </option>
                                <option value="target">
                                    Ziel {alias('target') && `(${alias('target')})`}
                                </option>
                            </select>
                        </label>
                        <span className="flex-1" />
                        <span className="text-xs text-grey-500">
                            Strg/Cmd + Enter führt aus. Höchstens 5000 Zeilen.
                        </span>
                    </div>
                    <textarea
                        aria-label="SOQL"
                        className={`${field} block w-full font-mono`}
                        rows={4}
                        value={soql}
                        placeholder="SELECT Id, Name FROM Account WHERE BillingState = 'CA'"
                        onChange={(e) => setSoql(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
                        }}
                    />
                    <div className="mt-3 flex items-center gap-3">
                        <Button disabled={!soql.trim() || query.isPending} onClick={run}>
                            {query.isPending ? 'Läuft …' : 'Ausführen'}
                        </Button>
                        {query.error && (
                            <span role="alert" className="text-[13px] text-bad">
                                {query.error.message}
                            </span>
                        )}
                    </div>
                </div>
            </Panel>

            {result && (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <Panel label="Ergebnis">
                        <div className="p-4">
                            <p className="mt-0 mb-2 text-[13px] text-grey-500">
                                {result.rows.length} Zeilen aus {result.alias}
                                {result.truncated && ` (von ${result.totalSize}, gekürzt)`}
                                {result.rows.length > SHOWN && `, angezeigt: ${SHOWN}`}. Spalte
                                anklicken für die Werte.
                            </p>
                            <div className="max-h-[60vh] overflow-auto">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr>
                                            {result.columns.map((c, i) => (
                                                <th
                                                    key={c}
                                                    className="sticky top-0 border-b border-grey-line bg-white px-2 py-1 text-left"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setColumn(i)}
                                                        className={`cursor-pointer font-bold ${i === column ? 'text-digital-blue underline' : 'text-grey-500'}`}
                                                    >
                                                        {c}
                                                    </button>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.rows.slice(0, SHOWN).map((r, i) => (
                                            <tr key={i}>
                                                {r.map((v, j) => (
                                                    <td
                                                        key={j}
                                                        className="border-b border-grey-100 px-2 py-1 align-top"
                                                    >
                                                        {v}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Panel>

                    <Panel label="Werte">
                        <div className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <h3 className="m-0 text-sm font-bold">Werte von {col}</h3>
                                <span className="text-[13px] text-grey-500">
                                    {values.length} verschiedene
                                </span>
                                <span className="flex-1" />
                                <Button
                                    small
                                    variant="ghost"
                                    onClick={() =>
                                        void navigator.clipboard.writeText(
                                            values.map((v) => v.value).join('\n')
                                        )
                                    }
                                >
                                    Kopieren
                                </Button>
                            </div>
                            {result.truncated && (
                                <p className="mt-0 mb-2 text-[13px] text-warn">
                                    Das Ergebnis ist gekürzt, die Werte sind unvollständig. GROUP BY
                                    liefert alle Werte.
                                </p>
                            )}
                            <div className="max-h-[40vh] overflow-auto">
                                <table className="w-full border-collapse text-sm">
                                    <tbody>
                                        {values.map((v) => (
                                            <tr key={v.value}>
                                                <td className="border-b border-grey-100 px-2 py-1">
                                                    {v.value || (
                                                        <em className="text-grey-500">(leer)</em>
                                                    )}
                                                </td>
                                                <td className="border-b border-grey-100 px-2 py-1 text-right text-grey-500">
                                                    {v.count}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <ToValueMapping key={col} column={col} values={values} />
                        </div>
                    </Panel>
                </div>
            )}
        </>
    );
}
