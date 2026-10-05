import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStudioMcpServer } from './server';
import { StudioApi } from './studioApi';

// Startet den Studio-MCP-Server über stdio. Adresse und Projektordner kommen aus der Umgebung,
// damit dieselbe Konfiguration für das Chat-Overlay und für VS Code gilt.
const baseUrl = process.env.STUDIO_URL ?? 'http://127.0.0.1:4174';
const projectDir = path.resolve(process.env.STUDIO_PROJECT ?? process.cwd());

await createStudioMcpServer({ api: new StudioApi(baseUrl), projectDir }).connect(
    new StdioServerTransport()
);
