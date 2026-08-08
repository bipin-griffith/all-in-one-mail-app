/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
  // mongodb-memory-server downloads a real mongod binary on first use per
  // machine/CI runner (~66MB) — the default 5s hook timeout isn't enough
  // for that download plus starting the in-memory server. Subsequent runs
  // reuse the cached binary and are fast; see .github/workflows/ci.yml for
  // the cache step that makes that true in CI too, not just locally.
  testTimeout: 30_000,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
