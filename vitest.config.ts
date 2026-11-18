import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // graphql 16 has no "exports" field, so Node always loads its CommonJS
    // build. Vite prefers the ESM build, which gives tests a second graphql
    // instance next to the one @graphql-tools loads. Match Node instead.
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
