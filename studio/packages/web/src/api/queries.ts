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

export const useOrgs = (enabled: boolean) =>
    useQuery({
        queryKey: ['orgs'],
        queryFn: api.orgs,
        enabled,
        refetchInterval: 5 * 60 * 1000
    });

// Angemeldete Orgs der sf-CLI; wird nur beim Öffnen der Auswahl geladen.
export const useAvailableOrgs = (enabled: boolean) =>
    useQuery({
        queryKey: ['orgs', 'available'],
        queryFn: api.availableOrgs,
        enabled,
        staleTime: 0
    });

export function useLogin() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.login,
        onSuccess: (data) => client.setQueryData(['orgs', 'available'], data)
    });
}

// Nach der Auswahl sind alle Org-abhängigen Daten (Status, Describe, Objekte) veraltet.
export function useSelectOrgs() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.selectOrgs,
        onSuccess: (data) => {
            client.setQueryData(['objects'], data);
            void client.invalidateQueries({ queryKey: ['orgs'] });
            void client.invalidateQueries({ queryKey: ['describe'] });
        }
    });
}

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
