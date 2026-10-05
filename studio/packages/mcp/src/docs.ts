import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Nur Markdown-Dateien direkt in docs/; keine Pfade, keine Unterordner.
export async function listDocs(projectDir: string): Promise<string[]> {
    return (await readdir(path.join(projectDir, 'docs')).catch(() => []))
        .filter((f) => f.endsWith('.md'))
        .sort();
}

export async function readDoc(projectDir: string, name: string): Promise<string> {
    if (!/^[\w.-]+\.md$/.test(name)) throw new Error('Ungültiger Dokumentname.');
    return readFile(path.join(projectDir, 'docs', name), 'utf8').catch(() => {
        throw new Error(`Dokument "${name}" nicht gefunden.`);
    });
}
