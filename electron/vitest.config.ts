import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
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
