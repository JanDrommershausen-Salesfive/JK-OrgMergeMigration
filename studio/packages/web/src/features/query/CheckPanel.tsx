import type { QueryCheck } from '@studio/shared';
import { Button } from '../../components/ui';

interface Props {
    result: QueryCheck | null;
    pending: boolean;
    error: string | null;
    disabled: boolean;
    onCheck: () => void;
}

const SF_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

// Lesende Prüfung: Treffer, Beispielzeilen. Die Parent-Zahlen erscheinen bei den Parents.
export function CheckPanel({ result, pending, error, disabled, onCheck }: Props) {
    return (
        <section>
            <div className="mb-2 flex items-center gap-3">
                <h3 className="text-sm font-bold">Prüfen</h3>
                <Button small variant="ghost" disabled={disabled || pending} onClick={onCheck}>
                    {pending ? 'Prüfe …' : 'Treffer und Parents prüfen'}
                </Button>
                <span className="text-[13px] text-grey-500">Liest nur, schreibt nichts.</span>
            </div>
            {error && (
                <p role="alert" className="text-[13px] text-bad">
                    {error}
                </p>
            )}
            {result?.error && (
                <p role="alert" className="text-[13px] text-bad">
                    {result.error}
                </p>
            )}
            {result && !result.error && (
                <>
                    <p className="mb-2 text-sm">
                        <b>{result.count}</b> Datensätze in der Quelle treffen die Query.
                    </p>
                    {result.rows.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-[13px]">
                                <thead>
                                    <tr>
                                        {result.columns.map((c) => (
                                            <th
                                                key={c}
                                                className="border-b border-grey-line px-2 py-1 text-left font-mono text-xs text-grey-500"
                                            >
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((r, i) => (
                                        <tr key={i}>
                                            {r.map((v, j) => (
                                                <td
                                                    key={j}
                                                    className="border-b border-grey-100 px-2 py-1 whitespace-nowrap"
                                                >
                                                    {recordUrl(result, j, v) ? (
                                                        <a
                                                            href={recordUrl(result, j, v)!}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="font-mono text-digital-blue underline"
                                                        >
                                                            {v}
                                                        </a>
                                                    ) : (
                                                        v
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-1 text-xs text-grey-500">
                                Erste {result.rows.length} Datensätze.
                            </p>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

// Link auf den Datensatz in der Quell-Org; Salesforce leitet /<Id> auf die passende Seite weiter.
function recordUrl(result: QueryCheck, column: number, value: string): string | null {
    const name = result.columns[column];
    if (!result.recordBaseUrl || !name || !result.idColumns.includes(name)) return null;
    return SF_ID.test(value) ? `${result.recordBaseUrl}/${value}` : null;
}
