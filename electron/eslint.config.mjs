import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['out/**', 'dist/**', '.vite/**', 'node_modules/**']
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    settings: {
      react: { version: 'detect' }
    }
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*'],
              message: 'src/core must be pure TypeScript — no Electron imports.'
            },
            {
              group: ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'],
              message: 'src/core must be pure TypeScript — no fs imports.'
            },
            {
              group: ['child_process', 'node:child_process'],
              message: 'src/core must be pure TypeScript — no child_process imports.'
            },
            {
              group: ['os', 'node:os'],
              message: 'src/core must be pure TypeScript — no os imports.'
            },
            {
              group: ['worker_threads', 'node:worker_threads'],
              message: 'src/core must be pure TypeScript — no worker_threads imports.'
            },
            {
              group: ['net', 'node:net'],
              message: 'src/core must be pure TypeScript — no net imports.'
            },
            {
              group: ['dgram', 'node:dgram'],
              message: 'src/core must be pure TypeScript — no dgram imports.'
            }
          ]
        }
      ]
    }
  }
]
