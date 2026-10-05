import { useState } from 'react';

// Die Query, wie sie in export.json steht (nur lesbar).
export function SoqlPreview({ soql }: { soql: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <section>
            <div className="mb-2 flex items-center gap-3">
                <h3 className="text-sm font-bold">Erzeugte Query</h3>
                <button
                    type="button"
                    className="cursor-pointer text-[13px] text-digital-blue underline"
                    onClick={() => {
                        void navigator.clipboard.writeText(soql);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    }}
                >
                    {copied ? 'Kopiert' : 'Kopieren'}
                </button>
            </div>
            <pre className="m-0 overflow-auto rounded-xl bg-grey-100 p-3 font-mono text-[13px] break-words whitespace-pre-wrap">
                {soql}
            </pre>
        </section>
    );
}
