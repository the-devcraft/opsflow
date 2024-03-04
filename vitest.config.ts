import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts'],
      exclude: ['src/server/index.ts', 'src/server/demo.ts', 'src/server/seed.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { statements: 80, branches: 75, functions: 75, lines: 80 },
    },
  },
});
