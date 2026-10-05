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

export const useCohorts = () => useQuery({ queryKey: ['cohorts'], queryFn: api.cohorts });

export function useCreateCohort() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.createCohort,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['cohorts'] })
    });
}

export const useSeriesPreview = () => useMutation({ mutationFn: api.seriesPreview });

export function useCreateSeries() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.createSeries,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['cohorts'] })
    });
}

export function useDeleteSeries() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.deleteSeries,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['cohorts'] })
    });
}

export function useDeleteCohort() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.deleteCohort,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['cohorts'] })
    });
}

// Vorschau liest für jedes Objekt Zahlen aus der Quelle; deshalb erst auf Knopfdruck (enabled).
export const useCohortPreview = (id: string | null, enabled: boolean) =>
    useQuery({
        queryKey: ['cohortPreview', id],
        queryFn: () => api.cohortPreview(id as string),
        enabled: enabled && id !== null,
        staleTime: 5 * 60 * 1000
    });

// Datensätze der Kohorte liest die Quelle; deshalb erst auf Knopfdruck (enabled).
export const useCohortRecords = (id: string, enabled: boolean) =>
    useQuery({
        queryKey: ['cohortRecords', id],
        queryFn: () => api.cohortRecords(id),
        enabled,
        staleTime: 5 * 60 * 1000
    });

export const useCleanerRules = () =>
    useQuery({ queryKey: ['cleanerRules'], queryFn: api.cleanerRules });
export const useCleanerStatus = () =>
    useQuery({ queryKey: ['cleanerStatus'], queryFn: api.cleanerStatus });
// Der Plan zählt in der Ziel-Org (dauert eine Minute) und wird deshalb nur auf Knopfdruck berechnet.
export const useCleanerPlan = () => useMutation({ mutationFn: api.cleanerPlan });

export const usePresets = (folder: string) =>
    useQuery({ queryKey: ['presets', folder], queryFn: () => api.presets(folder) });

export const usePresetDiff = (folder: string, id: string | null) =>
    useQuery({
        queryKey: ['presetDiff', folder, id],
        queryFn: () => api.presetDiff(folder, id as string),
        enabled: id !== null,
        staleTime: 0
    });

export function useSavePreset(folder: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.savePreset,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['presets', folder] })
    });
}

export function useDeletePreset(folder: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deletePreset(folder, id),
        onSuccess: () => void client.invalidateQueries({ queryKey: ['presets', folder] })
    });
}

// Nach dem Laden eines Stands ist alles veraltet, was aus export.json und ValueMapping.csv gelesen wird.
export function useRestorePreset(folder: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.restorePreset,
        onSuccess: () => {
            for (const key of ['presets', 'object', 'query', 'objects', 'describe', 'presetDiff']) {
                void client.invalidateQueries({ queryKey: [key] });
            }
            void folder;
        }
    });
}

// Org-Limits kosten einen API-Aufruf je Org; deshalb nur auf Anforderung und mit Zwischenspeicher.
export const useOrgLimits = () =>
    useQuery({ queryKey: ['orgLimits'], queryFn: api.orgLimits, staleTime: 60_000 });

export const useTodos = () => useQuery({ queryKey: ['todos'], queryFn: api.todos });

const useTodoMutation = <V, R>(fn: (v: V) => Promise<R>) => {
    const client = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => void client.invalidateQueries({ queryKey: ['todos'] })
    });
};
export const useImportTodos = () => useTodoMutation(api.importTodos);
export const useUpdateTodo = () => useTodoMutation(api.updateTodo);
export const useDeleteTodo = () => useTodoMutation(api.deleteTodo);

export const useQuickQuery = () => useMutation({ mutationFn: api.quickQuery });
