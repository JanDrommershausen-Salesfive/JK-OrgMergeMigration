import { z } from 'zod';

export const PresetSourceSchema = z.enum(['manual', 'backup']);

// meta.json eines Presets: ein manuell gespeicherter Stand der Konfiguration eines Objekts.
export const PresetInfoSchema = z.object({
    id: z.string(), // Ordnername: <Datum>_<Zeit>_<Name>
    name: z.string(),
    note: z.string(),
    createdAt: z.string(),
    source: PresetSourceSchema, // manual: bewusst gespeichert, backup: automatisch vor dem Laden
    hasValueMapping: z.boolean(),
    matchesCurrent: z.boolean() // identisch mit dem aktuellen Stand
});
export type PresetInfo = z.infer<typeof PresetInfoSchema>;

export const PresetListResponseSchema = z.object({ presets: z.array(PresetInfoSchema) });
export type PresetListResponse = z.infer<typeof PresetListResponseSchema>;

export const SavePresetRequestSchema = z.object({
    folder: z.string(),
    name: z.string().trim().min(1, 'Name fehlt').max(60),
    note: z.string().max(500).default('')
});
export type SavePresetRequest = z.infer<typeof SavePresetRequestSchema>;

export const RestorePresetRequestSchema = z.object({
    folder: z.string(),
    id: z.string(),
    // gesetzt: den aktuellen Stand vorher unter diesem Namen sichern
    backupName: z.string().trim().min(1).max(60).optional()
});
export type RestorePresetRequest = z.infer<typeof RestorePresetRequestSchema>;

export const DeletePresetRequestSchema = z.object({ folder: z.string(), id: z.string() });
export type DeletePresetRequest = z.infer<typeof DeletePresetRequestSchema>;

export const ConfigChangeSchema = z.object({
    area: z.enum(['query', 'filter', 'parent', 'mapping', 'excluded', 'valuemapping', 'other']),
    text: z.string()
});
export type ConfigChange = z.infer<typeof ConfigChangeSchema>;

// Was ändert sich, wenn das Preset geladen wird (vom aktuellen Stand zum Preset)?
export const PresetDiffSchema = z.object({ changes: z.array(ConfigChangeSchema) });
export type PresetDiff = z.infer<typeof PresetDiffSchema>;
