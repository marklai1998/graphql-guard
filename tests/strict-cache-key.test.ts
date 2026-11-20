import type { GraphQLResolveInfo } from 'graphql';
import { allow, rule } from '../src/index.js';
import type { PopulatedOptions } from '../src/types/index.js';

// The strict key skips hashing for empty args and for an undefined or null
// parent. These tests make sure those shortcuts never let different calls
// share a cached result.
describe('strict cache key shortcuts', () => {
  const options: PopulatedOptions = {
    suppressResolverError: false,
    debug: false,
    fallbackRule: allow,
  };

  // One context and one run, so every call in a test shares a rule cache.
  const setup = () => {
    const func = vi.fn().mockReturnValue(true);
    const strictRule = rule({ cache: 'strict' })(func);
    const ctx = {};
    const info = { variableValues: {} } as GraphQLResolveInfo;
    const resolve = (parent: unknown, args: object) =>
      strictRule.resolve(parent as object, args, ctx, info, options);
    return { func, resolve };
  };

  test('empty args and non-empty args on the same parent run separately', async () => {
    const { func, resolve } = setup();
    const parent = {};

    await resolve(parent, {});
    await resolve(parent, { id: 1 });
    expect(func).toHaveBeenCalledTimes(2);

    // Both results are cached.
    await resolve(parent, {});
    await resolve(parent, { id: 1 });
    expect(func).toHaveBeenCalledTimes(2);
  });

  test('an undefined root parent and an object parent run separately', async () => {
    const { func, resolve } = setup();

    await resolve(undefined, {});
    await resolve({}, {});
    expect(func).toHaveBeenCalledTimes(2);

    await resolve(undefined, {});
    expect(func).toHaveBeenCalledTimes(2);
  });

  test('an undefined parent and a null parent run separately', async () => {
    const { func, resolve } = setup();

    await resolve(undefined, {});
    await resolve(null, {});
    expect(func).toHaveBeenCalledTimes(2);
  });
});
