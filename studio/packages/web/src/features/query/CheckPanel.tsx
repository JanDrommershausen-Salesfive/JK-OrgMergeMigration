import type { QueryCheck } from '@studio/shared';
import { Button } from '../../components/ui';

interface Props {
    result: QueryCheck | null;
    pending: boolean;
    error: string | null;
    disabled: boolean;
    onCheck: () => void;
}

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
                                                    {v}
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
