import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // graphql-middleware loads the CommonJS build of graphql; use the same
    // build in tests so there is only one graphql instance.
    alias: [{ find: /^graphql$/, replacement: 'graphql/index.js' }],
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
      include: ['src'],
      exclude: ['**/tests/**', '**/*.d.ts'],
    },
  },
});
