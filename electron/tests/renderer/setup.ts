// Renderer test setup: adds @testing-library/jest-dom custom matchers to vitest's expect.
// Only runs in jsdom environment — the window guard prevents import in node tests.
//
// The `export {}` makes this a module, which is what legalises the top-level
// await. The import is untyped (jest-dom ships no matching types entry point
// for this resolution mode) and is only needed for its side effect.
export {}

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- side-effect import; package has no resolvable types here
  await import('@testing-library/jest-dom')
}
