import type { GraphQLResolveInfo } from 'graphql';
import { getRuleCache } from '../src/cache.js';

const info = (variableValues: unknown) =>
  ({ variableValues }) as unknown as GraphQLResolveInfo;

describe('getRuleCache', () => {
  test('gives each operation run its own cache, even with a shared context', () => {
    const ctx = {};
    const run = {};
    expect(getRuleCache(ctx, info(run))).toBe(getRuleCache(ctx, info(run)));
    expect(getRuleCache(ctx, info(run))).not.toBe(getRuleCache(ctx, info({})));
  });

  test('falls back to one cache per context without variable values', () => {
    const ctx = {};
    expect(getRuleCache(ctx, undefined)).toBe(getRuleCache(ctx, info(null)));
    expect(getRuleCache(ctx, undefined)).not.toBe(getRuleCache({}, undefined));
  });

  test('does not cache without a context object', () => {
    expect(getRuleCache(undefined, info({}))).not.toBe(
      getRuleCache(undefined, info({})),
    );
  });
});
