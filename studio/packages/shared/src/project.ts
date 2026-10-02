import { z } from 'zod';

const OrgRef = z.object({
    alias: z.string().min(1),
    orgId: z.string().min(15)
});

// Inhalt von migration.project.json im Projektordner (lokal, nicht im Git, keine Zugangsdaten).
export const ProjectConfigSchema = z.object({
    name: z.string().min(1),
    source: OrgRef,
    target: OrgRef,
    protectedOrgIds: z.array(z.string()).default([]),
    // Ordner, in dem die Datei angelegt wurde. Weicht er ab (Ordner kopiert), gilt die Datei nicht.
    projectPath: z.string().optional(),
    objectsDir: z.string().default('sfdmu'),
    docsDir: z.string().default('docs')
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
