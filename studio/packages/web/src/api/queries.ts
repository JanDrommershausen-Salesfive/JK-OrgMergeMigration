import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ObjectDetail, QueryModel } from '@studio/shared';
import { api } from './client';

export const useObjects = () => useQuery({ queryKey: ['objects'], queryFn: api.objects });

export const useObject = (folder: string | null, parentIndex?: number) =>
    useQuery({
        queryKey: ['object', folder, parentIndex ?? null],
        queryFn: () => api.object(folder as string, parentIndex),
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
    client.setQueryData(['object', detail.folder, detail.parentIndex], detail);
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

// Archivierte Läufe eines Objekts, neueste zuerst. Wird nach jedem Lauf neu geladen (Schlüssel 'runs').
export const useRuns = (folder: string | null) =>
    useQuery({
        queryKey: ['runs', folder],
        queryFn: () => api.runs(folder as string),
        enabled: folder !== null
    });

// Läufe aller Objekte, neueste zuerst (Schlüssel beginnt mit 'runs', wird nach jedem Lauf neu geladen).
export const useAllRuns = () => useQuery({ queryKey: ['runs', 'all'], queryFn: api.allRuns });

export const useRunDetail = (folder: string, id: string | null) =>
    useQuery({
        queryKey: ['runDetail', folder, id],
        queryFn: () => api.runDetail(folder, id as string),
        enabled: id !== null
    });

export const useRunLog = (folder: string, id: string | null, enabled: boolean) =>
    useQuery({
        queryKey: ['runLog', folder, id],
        queryFn: () => api.runLog(folder, id as string),
        enabled: enabled && id !== null
    });

export const useQueryModel = (folder: string) =>
    useQuery({ queryKey: ['query', folder], queryFn: () => api.queryModel(folder) });

// Query-Änderungen liefern das neue Modell zurück. Felder und Parents der Objektansicht ändern sich mit.
function useQueryMutation<V>(folder: string, fn: (v: V) => Promise<QueryModel>) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: (model) => {
            client.setQueryData(['query', folder], model);
            void client.invalidateQueries({ queryKey: ['object', folder] });
            void client.invalidateQueries({ queryKey: ['describe', folder] });
        }
    });
}

export const useSaveFilters = (folder: string) => useQueryMutation(folder, api.saveFilters);
export const useChangeFields = (folder: string) => useQueryMutation(folder, api.changeFields);

// Describe eines beliebigen Objekts (zum Beispiel eines Parents).
export const useDescribeObject = (object: string | null) =>
    useQuery({
        queryKey: ['describeObject', object],
        queryFn: () => api.describeObject(object as string),
        enabled: object !== null,
        staleTime: 10 * 60 * 1000
    });
export const useSetParentMode = (folder: string) => useQueryMutation(folder, api.setParentMode);
export const useCheckQuery = () => useMutation({ mutationFn: api.checkQuery });
