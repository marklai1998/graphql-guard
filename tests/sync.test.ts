import { makeExecutableSchema } from '@graphql-tools/schema';
import { execute, type GraphQLSchema, parse } from 'graphql';
import { allow, and, chain, deny, not, or, race, rule } from '../src/index.js';
import { applyGuard } from './helpers.js';

const makeSchema = (resolve: () => unknown = () => 'a'): GraphQLSchema =>
  makeExecutableSchema({
    typeDefs: `
      type Query {
        a: String
        b: String
      }
    `,
    resolvers: { Query: { a: resolve, b: () => 'b' } },
  });

const isPromise = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

// `execute` only returns a promise when some resolver did, so a plain result
// means every field was guarded without creating a promise.
const run = (schema: GraphQLSchema, source = '{ a b }') =>
  execute({ schema, document: parse(source), contextValue: {} });

describe('synchronous execution', () => {
  test('allow fields resolve synchronously', () => {
    const res = run(applyGuard(makeSchema(), { Query: allow }));

    expect(isPromise(res)).toBe(false);
    expect(res).toEqual({ data: { a: 'a', b: 'b' } });
  });

  test('the default fallbackRule resolves synchronously', () => {
    const res = run(applyGuard(makeSchema(), {}));

    expect(isPromise(res)).toBe(false);
    expect(res).toEqual({ data: { a: 'a', b: 'b' } });
  });

  test.each([
    ['rule', rule()(() => true)],
    ['cached rule', rule({ cache: 'contextual' })(() => true)],
    ['strict cached rule', rule({ cache: 'strict' })(() => true)],
    [
      'and',
      and(
        rule()(() => true),
        allow,
      ),
    ],
    [
      'or',
      or(
        deny,
        rule()(() => true),
      ),
    ],
    [
      'chain',
      chain(
        allow,
        rule()(() => true),
      ),
    ],
    [
      'race',
      race(
        deny,
        rule()(() => true),
      ),
    ],
    ['not', not(deny)],
  ])('a synchronous %s resolves synchronously', (_, ruleUnderTest) => {
    const res = run(applyGuard(makeSchema(), { Query: ruleUnderTest }));

    expect(isPromise(res)).toBe(false);
    expect(res).toEqual({ data: { a: 'a', b: 'b' } });
  });

  test('a synchronous denial resolves synchronously', () => {
    const res = run(
      applyGuard(makeSchema(), { Query: { a: rule()(() => false) } }),
    );

    expect(isPromise(res)).toBe(false);
    expect(res).toMatchObject({
      data: { a: null, b: 'b' },
      errors: [{ message: 'Not Authorised!' }],
    });
  });

  test('a synchronous rule that throws resolves synchronously', () => {
    const fallbackError = vi.fn((_err: unknown) => new Error('fallback'));
    const err = new Error('rule');
    const res = run(
      applyGuard(
        makeSchema(),
        {
          Query: {
            a: rule()(() => {
              throw err;
            }),
          },
        },
        { fallbackError },
      ),
    );

    expect(isPromise(res)).toBe(false);
    expect(res).toMatchObject({
      data: { a: null, b: 'b' },
      errors: [{ message: 'fallback' }],
    });
    expect(fallbackError.mock.calls[0]?.[0]).toBe(err);
  });

  test('an async rule still works', async () => {
    const res = run(
      applyGuard(makeSchema(), { Query: rule()(async () => true) }),
    );

    expect(isPromise(res)).toBe(true);
    expect(await res).toEqual({ data: { a: 'a', b: 'b' } });
  });

  test('the rule is not called for allow fields', () => {
    const allowMock = vi.fn(() => true);
    const res = run(
      applyGuard(
        makeSchema(),
        { Query: { b: rule()(allowMock) } },
        { fallbackRule: allow },
      ),
      '{ a }',
    );

    expect(res).toEqual({ data: { a: 'a' } });
    expect(allowMock).not.toHaveBeenCalled();
  });
});

describe('errors on allow fields', () => {
  test('a synchronous resolver error is replaced with fallbackError', () => {
    const res = run(
      applyGuard(
        makeSchema(() => {
          throw new Error('internal');
        }),
        { Query: allow },
      ),
    );

    expect(isPromise(res)).toBe(false);
    expect(res).toMatchObject({
      data: { a: null, b: 'b' },
      errors: [{ message: 'Not Authorised!' }],
    });
  });

  test('a rejected resolver is replaced with fallbackError', async () => {
    const res = await run(
      applyGuard(
        makeSchema(async () => {
          throw new Error('internal');
        }),
        { Query: allow },
      ),
    );

    expect(res).toMatchObject({
      data: { a: null, b: 'b' },
      errors: [{ message: 'Not Authorised!' }],
    });
  });

  test('debug mode rethrows resolver errors', async () => {
    const res = await run(
      applyGuard(
        makeSchema(() => {
          throw new Error('internal');
        }),
        { Query: allow },
        { debug: true },
      ),
    );

    expect(res).toMatchObject({
      data: { a: null, b: 'b' },
      errors: [{ message: 'internal' }],
    });
  });
});

describe('logic rules with synchronous errors', () => {
  test('and() inside not() runs every rule before denying', () => {
    const second = vi.fn(() => true);
    const res = run(
      applyGuard(makeSchema(), {
        Query: {
          a: not(
            and(
              rule()(() => {
                throw new Error('db down');
              }),
              rule()(second),
            ),
          ),
        },
      }),
    );

    expect(second).toHaveBeenCalled();
    return Promise.resolve(res).then((value) => {
      expect(value).toMatchObject({
        data: { a: null, b: 'b' },
        errors: [{ message: 'Not Authorised!' }],
      });
    });
  });

  test('a rule from another copy of graphql-guard falls back to resolve', async () => {
    const foreign = rule()(() => true);
    // A copy without the synchronous path only has the public resolve.
    const withoutSyncPath = Object.assign(Object.create(foreign), {
      resolve: foreign.resolve.bind(foreign),
    });
    for (const key of Object.getOwnPropertySymbols(
      Object.getPrototypeOf(foreign),
    )) {
      if (key.description === 'resolveMaybeSync') {
        Object.defineProperty(withoutSyncPath, key, { value: undefined });
      }
    }

    const res = run(
      applyGuard(makeSchema(), { Query: { a: withoutSyncPath } }),
    );

    expect(isPromise(res)).toBe(true);
    expect(await res).toEqual({ data: { a: 'a', b: 'b' } });
  });
});
