import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ObjectDetail } from '@studio/shared';
import { api } from './client';

export const useObjects = () => useQuery({ queryKey: ['objects'], queryFn: api.objects });

export const useObject = (folder: string | null) =>
    useQuery({
        queryKey: ['object', folder],
        queryFn: () => api.object(folder as string),
        enabled: folder !== null
    });

// Describe ruft beide Orgs ab (langsam); Ergebnis bleibt zehn Minuten frisch (wie der Server-Cache).
export const useDescribe = (folder: string | null) =>
    useQuery({
        queryKey: ['describe', folder],
        queryFn: () => api.describe(folder as string),
        enabled: folder !== null,
        staleTime: 10 * 60 * 1000
    });

export const useOrgs = () =>
    useQuery({ queryKey: ['orgs'], queryFn: api.orgs, refetchInterval: 5 * 60 * 1000 });

export const useRunStatus = () => useQuery({ queryKey: ['run'], queryFn: api.runStatus });

// Schreibende Aufrufe liefern das neue Objekt-Detail zurück; es ersetzt den Cache-Eintrag.
function storeDetail(client: QueryClient, detail: ObjectDetail) {
    client.setQueryData(['object', detail.folder], detail);
}

export function useSaveMapping() {
    const client = useQueryClient();
    return useMutation({ mutationFn: api.setMapping, onSuccess: (d) => storeDetail(client, d) });
}

export function useSaveExcluded() {
    const client = useQueryClient();
    return useMutation({ mutationFn: api.setExcluded, onSuccess: (d) => storeDetail(client, d) });
}

export function useSaveValueMapping() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.setValueMapping,
        onSuccess: (d) => storeDetail(client, d)
    });
}
