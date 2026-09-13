import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    // `scripts/**` holds one-off diagnostic/E2E probes (CDP drivers, mock LLM and
    // update servers) and `.devdata/**` is local scratch state; neither ships in
    // the package (see electron-builder.yml) and neither is part of the app
    // source, so linting them only produced noise (79 explicit-function-return-type
    // + 2 no-unused-vars errors on throwaway .mjs probes).
    ignores: ['**/node_modules', '**/dist', '**/out', '**/scripts', '**/.devdata']
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
