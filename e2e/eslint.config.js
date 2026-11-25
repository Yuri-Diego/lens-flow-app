import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['node_modules', 'playwright-report', 'test-results', 'blob-report']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // Sem isto, um expect sem await passa sem conferir nada.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Fixture sem dependências: async ({}, use) => …
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
])
