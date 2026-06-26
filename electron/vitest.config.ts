import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'node:fs'

// Mirror the renderer build's __APP_VERSION__ define so component tests resolve it.
const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    // Default environment for existing node tests stays node.
    // Renderer component tests in tests/renderer/** run in jsdom.
    environment: 'node',
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']],
    // globals: true makes vitest inject describe/it/expect as globals,
    // which jest-dom requires to extend expect.
    globals: true,
    setupFiles: ['tests/renderer/setup.ts'],
  },
})
