import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    // Dependencies like @graphql-tools load graphql through Node, which picks
    // its CommonJS build. Vite would pick the ESM build for the tests, giving
    // two graphql instances. Resolve graphql the way Node does (graphql 16
    // and 17 alike).
    alias: [{ find: /^graphql$/, replacement: require.resolve('graphql') }],
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
