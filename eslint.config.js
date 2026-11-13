import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-electron',
    'release',
    'backend/build',
    'backend/dist',
    'backend/venv',
  ]),
  {
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Product code is typed end to end (the IPC contract is zod-validated);
      // tests and .d.ts shims re-enable it below.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Accessibility rules for every rendered surface (renderer only).
    files: ['src/**/*.tsx'],
    ...jsxA11y.configs.recommended,
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // These widget roles are focusable by design and the plugin classes them
      // as non-interactive: the panel resize handle (focusable role=separator
      // with aria-valuenow, WAI-ARIA window splitter), the canvas surfaces
      // (role=application, keyboard-driven), and scrollable timeline regions
      // (axe scrollable-region-focusable requires a tab stop). Their key
      // handlers carry a targeted, commented disable at the element because
      // this rule's per-element options are keyed by tag, not role.
      'jsx-a11y-x/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'separator', 'application', 'region'], allowExpressionValues: true },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'src/types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
