import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Keep e2e runs off the dev database file.
    env: { DB_PATH: ':memory:' },
  },
});
