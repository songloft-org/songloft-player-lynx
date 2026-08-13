import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['e2e/scenarios/**/*.scenario.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    globalSetup: ['e2e/fixtures/global-setup.ts'],
    reporters: ['default', './e2e/reporter/markdown-reporter.ts'],
  },
})
