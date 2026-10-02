import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4174;
const here = path.dirname(fileURLToPath(import.meta.url));

// Projektordner: Parameter --project <Pfad>, sonst Repo-Root (Elternordner von studio/).
const argIdx = process.argv.indexOf('--project');
const projectDir = path.resolve(
    argIdx > -1 ? (process.argv[argIdx + 1] ?? '.') : path.join(here, '../../../..')
);

const app = await buildApp({
    projectDir,
    webDist: path.join(here, '../../web/dist'),
    port: PORT
});
await app.listen({ host: HOST, port: PORT });
console.log(`Migration Studio: http://${HOST}:${PORT}  (Projekt: ${projectDir})`);
