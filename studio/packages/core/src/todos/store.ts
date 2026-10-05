import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TodoItemSchema, type TodoItem } from '@studio/shared';
import { z } from 'zod';
import { writeFileAtomic } from '../util/fs';

const FileSchema = z.object({ items: z.array(TodoItemSchema) });

// Lokale Ablage der Migration-To-Do-Liste (todos/migration-todos.json, nicht im Git: enthält Kundennamen).
// Später durch eine gemeinsame Datenbank ersetzbar; die Facade kennt nur load und save.
export class TodoStore {
    private readonly file: string;

    constructor(projectDir: string) {
        this.file = path.join(projectDir, 'todos', 'migration-todos.json');
    }

    async load(): Promise<TodoItem[]> {
        try {
            return FileSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))).items;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw err;
        }
    }

    async save(items: TodoItem[]): Promise<void> {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFileAtomic(this.file, JSON.stringify({ items }, null, 2) + '\n');
    }
}
