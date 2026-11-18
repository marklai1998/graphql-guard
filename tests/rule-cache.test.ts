import type { GraphQLResolveInfo } from 'graphql';
import { getRuleCache } from '../src/cache.js';

const info = (variableValues: unknown) =>
  ({ variableValues }) as unknown as GraphQLResolveInfo;

const subscriptionInfo = (variableValues: unknown, rootValue: unknown) =>
  ({
    variableValues,
    rootValue,
    operation: { operation: 'subscription' },
  }) as unknown as GraphQLResolveInfo;

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

  test('gives each subscription event its own cache when variable values are reused', () => {
    // graphql-js 17 passes the same variableValues object for every event.
    const ctx = {};
    const run = {};
    const event = { count: 1 };
    expect(getRuleCache(ctx, subscriptionInfo(run, event))).toBe(
      getRuleCache(ctx, subscriptionInfo(run, event)),
    );
    expect(getRuleCache(ctx, subscriptionInfo(run, event))).not.toBe(
      getRuleCache(ctx, subscriptionInfo(run, { count: 2 })),
    );
  });

  test('keys a subscription by run as well as root value', () => {
    // A server-wide rootValue must not share a cache across requests.
    const ctx = {};
    const rootValue = {};
    expect(getRuleCache(ctx, subscriptionInfo({}, rootValue))).not.toBe(
      getRuleCache(ctx, subscriptionInfo({}, rootValue)),
    );
  });

  test('ignores the root value outside subscriptions', () => {
    const ctx = {};
    const run = {};
    const query = (rootValue: unknown) =>
      ({
        variableValues: run,
        rootValue,
        operation: { operation: 'query' },
      }) as unknown as GraphQLResolveInfo;
    expect(getRuleCache(ctx, query({}))).toBe(getRuleCache(ctx, query({})));
  });
});
