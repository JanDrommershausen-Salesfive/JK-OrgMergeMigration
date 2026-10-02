import type { OrgStatus } from '@studio/shared';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useOrgs } from '../../api/queries';
import { Button } from '../../components/ui';

function OrgCard({
    role,
    org,
    alias
}: {
    role: string;
    org: OrgStatus | undefined;
    alias: string;
}) {
    const dot = !org
        ? 'bg-grey-500 animate-pulse'
        : org.connected && org.idMatches
          ? 'bg-[#3ddc84]'
          : 'bg-[#ff6b63]';
    const status = !org
        ? 'prüfe …'
        : !org.connected
          ? 'nicht verbunden'
          : org.idMatches
            ? 'verbunden'
            : 'falsche Org';
    return (
        <div className="min-w-0 rounded-xl border border-white/20 bg-white/10 px-6 py-3">
            <div className="flex items-center gap-2 text-xs font-bold text-open-blue">
                <span className={`inline-block size-2.5 flex-none rounded-full ${dot}`} />
                {role}
                <span className="ml-auto font-normal text-white/85">{status}</span>
            </div>
            <div className="my-1 text-[22px] tracking-tighter">
                {org?.alias ?? alias}
                {org?.connected && (
                    <span className="ml-2 text-[13px] text-white/70">
                        {org.isSandbox ? 'Sandbox' : 'Production'}
                    </span>
                )}
            </div>
            {org?.connected && (
                <>
                    <div
                        className="truncate text-[13px] text-white/70"
                        title={org.instanceUrl ?? ''}
                    >
                        {org.name} · {org.instance} · …{org.orgId.slice(-4)}
                    </div>
                    <div className="truncate text-[13px] text-white/70">{org.username}</div>
                    {!org.idMatches && (
                        <div className="text-[13px] text-[#ffb4ae]">
                            Alias zeigt auf eine andere Org als in der Projektkonfiguration
                            festgelegt.
                        </div>
                    )}
                </>
            )}
            {org && !org.connected && (
                <div className="text-[13px] text-[#ffb4ae]">
                    {org.error} (
                    <span className="font-mono">sf org login web --alias {org.alias}</span>)
                </div>
            )}
        </div>
    );
}

export function OrgHeader({
    sourceAlias,
    targetAlias
}: {
    sourceAlias: string;
    targetAlias: string;
}) {
    const orgs = useOrgs();
    const client = useQueryClient();
    const checking = useIsFetching({ queryKey: ['orgs'] }) > 0;
    const error = orgs.error ? 'GUI-Server nicht erreichbar' : null;
    const failed = (alias: string): OrgStatus => ({
        connected: false,
        alias,
        error: error ?? '',
        instanceUrl: null,
        username: null
    });

    return (
        <header className="bg-deep px-8 py-6 text-white">
            <div className="mb-4 flex items-center justify-between gap-4">
                <img src="/logo.svg" alt="Salesfive" className="block h-[26px] w-auto" />
                <Button
                    variant="onDark"
                    small
                    disabled={checking}
                    onClick={() => {
                        void client.invalidateQueries({ queryKey: ['orgs'] });
                        void client.invalidateQueries({ queryKey: ['describe'] });
                    }}
                >
                    Verbindung prüfen
                </Button>
            </div>
            <p className="mb-1 text-xs font-bold text-open-blue">Datenmigration</p>
            <h1 className="text-[28px] leading-tight font-normal tracking-tighter">
                Migration Studio
            </h1>
            <div
                className="mt-4 grid grid-cols-1 items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]"
                aria-live="polite"
            >
                <OrgCard
                    role="QUELLE"
                    alias={sourceAlias}
                    org={error ? failed(sourceAlias) : orgs.data?.source}
                />
                <div
                    className="self-center justify-self-center text-[28px] text-open-blue max-md:rotate-90"
                    aria-hidden="true"
                >
                    →
                </div>
                <OrgCard
                    role="ZIEL"
                    alias={targetAlias}
                    org={error ? failed(targetAlias) : orgs.data?.target}
                />
            </div>
        </header>
    );
}
