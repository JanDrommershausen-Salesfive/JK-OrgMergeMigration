import type { LoginRequest } from '@studio/shared';
import { useState } from 'react';
import { useLogin } from '../../api/queries';
import { Button } from '../../components/ui';

const field = 'rounded-lg border border-grey-line bg-white px-2.5 py-1.5 text-sm';

// Meldet eine weitere Org per Browser an (sf org login web), ohne VS Code.
export function NewOrgLogin() {
    const login = useLogin();
    const [alias, setAlias] = useState('');
    const [kind, setKind] = useState<LoginRequest['kind']>('production');
    const [url, setUrl] = useState('');

    return (
        <details className="mt-4 rounded-xl border border-grey-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold">Neue Org anmelden</summary>
            <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    login.mutate({ alias, kind, instanceUrl: kind === 'custom' ? url : undefined });
                }}
            >
                <label className="text-xs text-grey-500">
                    Alias
                    <input
                        className={`${field} mt-1 block w-44`}
                        value={alias}
                        required
                        pattern="[A-Za-z0-9][\w.\-]{0,39}"
                        placeholder="z. B. cdev5"
                        onChange={(e) => setAlias(e.target.value)}
                    />
                </label>
                <label className="text-xs text-grey-500">
                    Art
                    <select
                        className={`${field} mt-1 block`}
                        value={kind}
                        onChange={(e) => setKind(e.target.value as LoginRequest['kind'])}
                    >
                        <option value="production">Production / Developer</option>
                        <option value="sandbox">Sandbox</option>
                        <option value="custom">Eigene URL (My Domain)</option>
                    </select>
                </label>
                {kind === 'custom' && (
                    <label className="text-xs text-grey-500">
                        URL
                        <input
                            className={`${field} mt-1 block w-72`}
                            value={url}
                            required
                            placeholder="https://firma--sbx.sandbox.my.salesforce.com"
                            onChange={(e) => setUrl(e.target.value)}
                        />
                    </label>
                )}
                <Button type="submit" variant="ghost" small disabled={login.isPending}>
                    Im Browser anmelden
                </Button>
            </form>
            {login.isPending && (
                <p role="status" className="mt-2 text-[13px] text-grey-500">
                    Der Browser öffnet sich. Login dort abschließen (bis zu 5 Minuten).
                </p>
            )}
            {login.isError && (
                <p role="alert" className="mt-2 text-[13px] text-bad">
                    {login.error.message}
                </p>
            )}
            {login.isSuccess && !login.isPending && (
                <p role="status" className="mt-2 text-[13px] text-ok">
                    ✓ Angemeldet. Die Org steht oben in der Liste.
                </p>
            )}
        </details>
    );
}
