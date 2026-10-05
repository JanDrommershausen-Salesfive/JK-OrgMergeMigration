import { readFile, rename, writeFile } from 'node:fs/promises';

// Erst in eine temporäre Datei schreiben, dann umbenennen: ein Abbruch hinterlässt nie eine halbe Datei.
export async function writeFileAtomic(file: string, content: string): Promise<void> {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, content);
    await rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T> {
    return JSON.parse(await readFile(file, 'utf8')) as T;
}
