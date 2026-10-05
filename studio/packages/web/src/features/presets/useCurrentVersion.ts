import { usePresets } from '../../api/queries';

// Name der gespeicherten Version, die dem aktuellen Stand des Objekts entspricht.
// saved: false, wenn keine passt (ungespeicherte Änderungen); null, solange die Liste lädt.
export function useCurrentVersion(folder: string) {
    const presets = usePresets(folder);
    const list = presets.data?.presets ?? [];
    const match = list.find((p) => p.matchesCurrent);
    return {
        loading: presets.isPending,
        list,
        saved: presets.data ? !!match : null,
        name: match?.name ?? null
    };
}
