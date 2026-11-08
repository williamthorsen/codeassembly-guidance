import path from 'node:path';

import baseConfig, { commonIgnores, toolIgnores } from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

// Names the helpers that remove a test's scratch directory, so that a direct `mkdtemp` in a test cannot leak one.
const SCRATCH_DIR_MESSAGE =
  'Create test scratch directories with `makeScratchDir` (packages/guidance/src/test-utils/make-scratch-dir.ts), with `makeSmokeScratchDir` in a smoke-test builder, or elsewhere with `createTempTree` and `disposeOnTestFinished`, which remove them.';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    ...commonIgnores,
    ...toolIgnores,
    '**/.playwright-mcp/**',
    // Throwaway spikes live outside the workspace and are exempt from lint.
    'spikes/**',
    // Ignore test fixtures that ESLint's parsers cannot read, marked by a `.malformed` infix.
    '**/__tests__/**/fixtures/**/*.malformed/**',
    '**/__tests__/**/fixtures/**/*.malformed.*',
  ]),
  {
    settings: {
      // `import-x/extensions` needs a resolver to tell a `.js` specifier from the `.ts` file that it names.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          noWarnOnMultipleProjects: true,
          // Name the tsconfigs explicitly; the resolver's cwd-relative default misses packages when lint runs per workspace.
          project: [
            path.join(import.meta.dirname, 'tsconfig.json'),
            path.join(import.meta.dirname, 'packages/*/tsconfig.json'),
          ],
        }),
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        // Anchor the project service (enabled by the base config) at the repo root.
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
          ignoreVoidReturningFunctions: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/test-utils/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...readBaseRuleOptions('no-restricted-syntax'),
        ...[
          'CallExpression[callee.name=/^mkdtemp(Sync)?$/]',
          'CallExpression[callee.property.name=/^mkdtemp(Sync)?$/]',
        ].map((selector) => ({ selector, message: SCRATCH_DIR_MESSAGE })),
      ],
    },
  },
]);

export default config;

// region | Helpers

/**
 * Returns the options after the severity that the base config sets for `rule`, so that a block restating the rule
 * keeps them: A later block replaces a rule's options rather than merging with them.
 */
function readBaseRuleOptions(rule: string): unknown[] {
  for (const block of baseConfig.toReversed()) {
    const setting: unknown = block.rules?.[rule];
    if (Array.isArray(setting)) return setting.slice(1);
  }
  return [];
}

// endregion | Helpers
