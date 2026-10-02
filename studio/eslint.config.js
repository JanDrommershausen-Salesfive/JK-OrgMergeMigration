import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['packages/web/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        languageOptions: { globals: globals.browser },
        rules: reactHooks.configs.recommended.rules
    },
    {
        files: ['packages/{core,server,shared}/**/*.ts'],
        languageOptions: { globals: globals.node }
    },
    {
        // Schichtenregel: web importiert nur shared, core kennt weder Server noch Web.
        files: ['packages/web/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', { patterns: ['@studio/core', '@studio/server'] }]
        }
    },
    {
        files: ['packages/core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                { patterns: ['@studio/server', '@studio/web', 'fastify', 'react*'] }
            ]
        }
    }
);
