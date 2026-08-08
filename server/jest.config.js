/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
  // sanitize-html (2.17.5+, needed for a security patch) pulls in ESM-only
  // htmlparser2 that Jest 29's runtime can't load — see
  // src/testUtils/sanitizeHtml.mock.ts for the full explanation and why a
  // lightweight stand-in is the right call here rather than a Babel
  // toolchain just for test-time ESM interop.
  moduleNameMapper: {
    '^sanitize-html$': '<rootDir>/src/testUtils/sanitizeHtml.mock.ts',
  },
  // mongodb-memory-server downloads a real mongod binary on first use per
  // machine/CI runner (~66MB) — the default 5s hook timeout isn't enough
  // for that download plus starting the in-memory server. Subsequent runs
  // reuse the cached binary and are fast; see .github/workflows/ci.yml for
  // the cache step that makes that true in CI too, not just locally.
  testTimeout: 30_000,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
