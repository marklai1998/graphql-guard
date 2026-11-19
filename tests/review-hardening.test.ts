import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLScalarType, graphql } from 'graphql';
import { not, rule } from '../src/index.js';
import { applyGuard } from './helpers.js';

describe('rules from another copy of graphql-guard', () => {
  test('not() denies when a rule from the other copy throws', async () => {
    vi.resetModules();
    const other = await import('../src/index.js');
    expect(other.rule).not.toBe(rule);

    const throws = other.rule()(() => {
      throw new Error('db down');
    });
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { a: String }',
        resolvers: { Query: { a: () => 'SECRET' } },
      }),
      { Query: { a: not(throws) } },
      { fallbackError: null },
    );

    const res = await graphql({ schema, source: '{ a }', contextValue: {} });
    expect(res).toEqual({ data: { a: null } });
  });

  test("the other copy's allow leaves the field unwrapped", async () => {
    vi.resetModules();
    const other = await import('../src/index.js');
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { a: String }',
      resolvers: { Query: { a: () => 'a' } },
    });
    const guarded = applyGuard(schema, { Query: { a: other.allow } });
    expect(guarded.getQueryType()?.getFields().a?.resolve).toBe(
      schema.getQueryType()?.getFields().a?.resolve,
    );
  });
});

describe('strict cache keys parents by identity', () => {
  class User {
    #secret: string;
    constructor(secret: string) {
      this.#secret = secret;
    }
    get secret() {
      return this.#secret;
    }
  }

  test('parents that differ only in #private fields do not share a result', async () => {
    const canSee = rule({ cache: 'strict' })(
      (parent: User, _args, ctx) => parent.secret === ctx.viewer,
    );
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: `
          type Query { users: [User!]! }
          type User { secret: String }
        `,
        resolvers: {
          Query: { users: () => [new User('alice'), new User('bob')] },
          User: { secret: (u: User) => u.secret },
        },
      }),
      { User: { secret: canSee } },
      { fallbackError: null },
    );

    const res = await graphql({
      schema,
      source: '{ users { secret } }',
      contextValue: { viewer: 'alice' },
    });
    expect(res).toEqual({
      data: { users: [{ secret: 'alice' }, { secret: null }] },
    });
  });

  test('the same parent is still cached across fields', async () => {
    const allowMock = vi.fn().mockReturnValue(true);
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: `
          type Query { user: User! }
          type User { a: String b: String }
        `,
        resolvers: {
          Query: { user: () => ({ a: 'a', b: 'b' }) },
        },
      }),
      { User: rule({ cache: 'strict' })(allowMock) },
    );

    const res = await graphql({
      schema,
      source: '{ user { a b } }',
      contextValue: {},
    });
    expect(res).toEqual({ data: { user: { a: 'a', b: 'b' } } });
    expect(allowMock).toHaveBeenCalledTimes(1);
  });
});

describe('strict cache keys class instances in args by identity', () => {
  class Money {
    #cents: number;
    constructor(cents: number) {
      this.#cents = cents;
    }
    get cents() {
      return this.#cents;
    }
  }

  const MoneyScalar = new GraphQLScalarType({
    name: 'Money',
    parseValue: (value) => new Money(Number(value)),
    parseLiteral: (ast) => new Money(Number((ast as { value: string }).value)),
    serialize: (value) => String(value),
  });

  const buildSchema = (
    func: (parent: unknown, args: { amount: Money }) => boolean,
  ) =>
    applyGuard(
      makeExecutableSchema({
        typeDefs: `
          scalar Money
          type Query { pay(amount: Money!): String }
        `,
        resolvers: {
          Money: MoneyScalar,
          Query: {
            pay: (_: unknown, { amount }: { amount: Money }) =>
              String(amount.cents),
          },
        },
      }),
      {
        Query: {
          pay: rule({ cache: 'strict' })((parent, args) =>
            func(parent, args as { amount: Money }),
          ),
        },
      },
      { fallbackError: null },
    );

  test('args that differ only in #private fields do not share a result', async () => {
    const schema = buildSchema((_parent, args) => args.amount.cents < 100);
    const res = await graphql({
      schema,
      source: '{ small: pay(amount: 50) large: pay(amount: 5000) }',
      contextValue: {},
    });
    expect(res).toEqual({ data: { small: '50', large: null } });
  });

  test('plain input objects in args are still hashed by value', async () => {
    const allowMock = vi.fn().mockReturnValue(true);
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: `
          input Filter { tags: [String!]! }
          type Query { a(f: Filter!): String b(f: Filter!): String }
        `,
        resolvers: { Query: { a: () => 'a', b: () => 'b' } },
      }),
      { Query: rule({ cache: 'strict' })(allowMock) },
    );
    const res = await graphql({
      schema,
      source: '{ a(f: { tags: ["x"] }) b(f: { tags: ["x"] }) }',
      contextValue: {},
    });
    expect(res).toEqual({ data: { a: 'a', b: 'b' } });
    expect(allowMock).toHaveBeenCalledTimes(1);
  });
});

describe('cache key functions', () => {
  test('a key that is not a string or number runs the rule uncached', async () => {
    const isDocOne = vi.fn((_parent, args: { id: string }) => args.id === '1');
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { doc(id: ID!): String }',
        resolvers: {
          Query: { doc: (_: unknown, { id }: { id: string }) => id },
        },
      }),
      {
        Query: {
          // Plain JavaScript can return an object; TypeScript would reject it.
          doc: rule({
            cache: ((_p: unknown, args: { id: string }) => ({
              id: args.id,
            })) as unknown as () => string,
          })(isDocOne),
        },
      },
      { fallbackError: null },
    );

    const res = await graphql({
      schema,
      source: '{ one: doc(id: "1") two: doc(id: "2") }',
      contextValue: {},
    });
    expect(res).toEqual({ data: { one: '1', two: null } });
    expect(isDocOne).toHaveBeenCalledTimes(2);
  });

  test('a number key is accepted and cached', async () => {
    const allowMock = vi.fn().mockReturnValue(true);
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { a: String b: String }',
        resolvers: { Query: { a: () => 'a', b: () => 'b' } },
      }),
      { Query: rule({ cache: () => 1 })(allowMock) },
    );

    const res = await graphql({ schema, source: '{ a b }', contextValue: {} });
    expect(res).toEqual({ data: { a: 'a', b: 'b' } });
    expect(allowMock).toHaveBeenCalledTimes(1);
  });
});

describe('a fallbackError function that throws', () => {
  const makeSchema = (
    ruleFn: () => unknown,
    fallbackError: (...args: unknown[]) => never,
  ) =>
    applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { a: String }',
        resolvers: { Query: { a: () => 'a' } },
      }),
      // biome-ignore lint/suspicious/noExplicitAny: test rule bodies
      { Query: { a: rule()(ruleFn as any) } },
      { fallbackError },
    );

  test.each([
    ['sync deny', () => false],
    ['async deny', async () => false],
    [
      'sync throw',
      () => {
        throw new Error('rule broke');
      },
    ],
    [
      'async throw',
      async () => {
        throw new Error('rule broke');
      },
    ],
  ])('is called once (%s)', async (_name, ruleFn) => {
    const fallbackError = vi.fn(() => {
      throw new Error('from fallback');
    });
    const res = await graphql({
      schema: makeSchema(ruleFn, fallbackError),
      source: '{ a }',
      contextValue: {},
    });

    expect(fallbackError).toHaveBeenCalledTimes(1);
    const [firstArg] = fallbackError.mock.calls[0] as unknown[];
    expect((firstArg as Error | null)?.message).not.toBe('from fallback');
    expect(res.errors?.[0]?.message).toBe('from fallback');
    expect(res.data).toEqual({ a: null });
  });
});

describe('a rule that returns an empty string', () => {
  test('denies with fallbackError', async () => {
    const schema = applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { a: String }',
        resolvers: { Query: { a: () => 'a' } },
      }),
      { Query: { a: rule()(() => '') } },
    );

    const res = await graphql({ schema, source: '{ a }', contextValue: {} });
    expect(res.errors?.[0]?.message).toBe('Not Authorised!');
  });
});
