import { defineConfig } from 'vitest/config';

// Projekte: Kern und Server laufen in Node, die GUI mit eigener Konfiguration (happy-dom).
export default defineConfig({
    test: {
        projects: [
            { test: { name: 'core', root: 'packages/core', environment: 'node' } },
            { test: { name: 'server', root: 'packages/server', environment: 'node' } },
            'packages/web'
        ]
    }
});
