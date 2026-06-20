// Renderer test setup: adds @testing-library/jest-dom custom matchers to vitest's expect.
// Only runs in jsdom environment — the window guard prevents import in node tests.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom')
}
