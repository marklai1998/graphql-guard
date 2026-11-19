import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  type GraphQLFieldResolver,
  type GraphQLResolveInfo,
  getIntrospectionQuery,
  graphql,
} from 'graphql';
import { allow, deny, rule } from '../src/index.js';
import { applyGuard } from './helpers.js';

describe('generates correct middleware', () => {
  test('correctly applies schema rule to schema', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        type: Type
      }
      type Type {
        a: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        type: () => ({}),
      },
      Type: {
        a: () => 'a',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowMock = vi.fn().mockResolvedValue(true);

    const schemaWithPermissions = applyGuard(
      schema,
      rule({ cache: 'no_cache' })(allowMock),
    );

    /* Execution */
    const query = `
      query {
        a
        type {
          a
        }
      }
    `;

    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res).toEqual({
      data: {
        a: 'a',
        type: {
          a: 'a',
        },
      },
    });
    expect(allowMock).toBeCalledTimes(3);
  });

  test('correctly applies type rule to type', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        type: Type
      }
      type Type {
        a: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        type: () => ({}),
      },
      Type: {
        a: () => 'a',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowMock = vi.fn().mockResolvedValue(true);

    const schemaWithPermissions = applyGuard(schema, {
      Query: rule({ cache: 'no_cache' })(allowMock),
    });

    /* Execution */
    const query = `
      query {
        a
        type {
          a
        }
      }
    `;

    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res).toEqual({
      data: {
        a: 'a',
        type: {
          a: 'a',
        },
      },
    });
    expect(allowMock).toBeCalledTimes(2);
  });

  test('correctly applies field rule to field', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        type: Type
      }
      type Type {
        a: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        type: () => ({}),
      },
      Type: {
        a: () => 'a',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowMock = vi.fn().mockResolvedValue(true);

    const schemaWithPermissions = applyGuard(schema, {
      Query: { a: rule({ cache: 'no_cache' })(allowMock) },
    });

    /* Execution */
    const query = `
      query {
        a
        type {
          a
        }
      }
    `;

    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res).toEqual({
      data: {
        a: 'a',
        type: {
          a: 'a',
        },
      },
    });
    expect(allowMock).toBeCalledTimes(1);
  });

  test('correctly applies wildcard rule to type', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        b: String
        type: Type
      }
      type Type {
        field1: String
        field2: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        b: () => 'b',
        type: () => ({
          field1: 'field1',
          field2: 'field2',
        }),
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowMock = vi.fn().mockResolvedValue(true);
    const defaultQueryMock = vi.fn().mockResolvedValue(true);
    const defaultTypeMock = vi.fn().mockResolvedValue(true);

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        a: rule({ cache: 'no_cache' })(allowMock),
        type: rule({ cache: 'no_cache' })(vi.fn().mockResolvedValue(true)),
        '*': rule({ cache: 'no_cache' })(defaultQueryMock),
      },
      Type: {
        '*': rule({ cache: 'no_cache' })(defaultTypeMock),
      },
    });

    /* Execution */
    const query = `
      query {
        a
        b
        type {
          field1
          field2
        }
      }
    `;

    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res).toEqual({
      data: {
        a: 'a',
        b: 'b',
        type: {
          field1: 'field1',
          field2: 'field2',
        },
      },
    });
    expect(allowMock).toBeCalledTimes(1);
    expect(defaultQueryMock).toBeCalledTimes(1);
    expect(defaultTypeMock).toBeCalledTimes(2);
  });

  test('correctly allows multiple uses of the same wildcard rule', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        b: String
        type: Type
      }
      type Type {
        field1: String
        field2: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        b: () => 'b',
        type: () => ({
          field1: 'field1',
          field2: 'field2',
        }),
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowMock = vi.fn().mockResolvedValue(true);
    const defaultQueryMock = vi.fn().mockResolvedValue(true);
    const defaultTypeMock = vi.fn().mockResolvedValue(true);

    const rules = {
      Query: {
        a: rule({ cache: 'no_cache' })(allowMock),
        type: rule({ cache: 'no_cache' })(vi.fn().mockResolvedValue(true)),
        '*': rule({ cache: 'no_cache' })(defaultQueryMock),
      },
      Type: {
        '*': rule({ cache: 'no_cache' })(defaultTypeMock),
      },
    };

    /* First usage */
    applyGuard(schema, rules);

    /* Second usage */
    const schemaWithPermissions = applyGuard(schema, rules);

    /* Execution */
    const query = `
      query {
        a
        b
        type {
          field1
          field2
        }
      }
    `;

    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res).toEqual({
      data: {
        a: 'a',
        b: 'b',
        type: {
          field1: 'field1',
          field2: 'field2',
        },
      },
    });
    expect(allowMock).toBeCalledTimes(1);
    expect(defaultQueryMock).toBeCalledTimes(1);
    expect(defaultTypeMock).toBeCalledTimes(2);
  });
});

describe('schema', () => {
  test('returns a new schema and leaves the original unguarded', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { secret: String }',
      resolvers: { Query: { secret: () => 'secret' } },
    });

    const guarded = applyGuard(schema, { Query: { secret: deny } });

    expect(guarded).not.toBe(schema);
    expect(
      await graphql({ schema: guarded, source: '{ secret }' }),
    ).toMatchObject({ data: { secret: null } });
    expect(await graphql({ schema, source: '{ secret }' })).toEqual({
      data: { secret: 'secret' },
    });
  });
});

describe('introspection', () => {
  const schema = makeExecutableSchema({
    typeDefs: 'type Query { a: String }',
    resolvers: { Query: { a: () => 'a' } },
  });

  test('the full introspection query works with fallbackRule: deny', async () => {
    const guarded = applyGuard(
      schema,
      { Query: { a: deny } },
      { fallbackRule: deny },
    );

    const result = await graphql({
      schema: guarded,
      source: getIntrospectionQuery(),
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.__schema).toBeDefined();
  });

  test('rules never run for introspection fields', async () => {
    const seen = vi.fn();
    const guarded = applyGuard(
      schema,
      rule()((_parent, _args, _ctx, info) => {
        seen(`${info.parentType.name}.${info.fieldName}`);
        return true;
      }),
    );

    await graphql({
      schema: guarded,
      source: '{ a __typename __schema { types { name fields { name } } } }',
    });

    expect(seen.mock.calls.flat()).toEqual(['Query.a']);
  });
});

describe('allow', () => {
  const schema = makeExecutableSchema({
    typeDefs: `
      type Query {
        a: String
        async: String
        throws: String
        rejects: String
      }
    `,
    resolvers: {
      Query: {
        a: () => 'a',
        async: async () => 'async',
        throws: () => {
          throw new Error('internal');
        },
        rejects: async () => {
          throw new Error('internal');
        },
      },
    },
  });

  const info = {} as GraphQLResolveInfo;
  const resolverOf = (s: typeof schema, field: string) =>
    s.getQueryType()?.getFields()[field].resolve as GraphQLFieldResolver<
      unknown,
      unknown
    >;

  // An async wrapper would make every allowed field a promise, which makes
  // large lists of allowed fields several times slower to execute.
  test('keeps a synchronous resolver synchronous', () => {
    const guarded = applyGuard(schema, { Query: { a: allow } });

    expect(resolverOf(guarded, 'a')({}, {}, {}, info)).toBe('a');
  });

  test('keeps a synchronous resolver synchronous as the fallback rule', () => {
    const guarded = applyGuard(schema, {});

    expect(resolverOf(guarded, 'a')({}, {}, {}, info)).toBe('a');
  });

  test('passes an empty context when there is none', () => {
    const resolve = vi.fn();
    const guarded = applyGuard(
      makeExecutableSchema({
        typeDefs: 'type Query { a: String }',
        resolvers: { Query: { a: resolve } },
      }),
      {},
    );

    resolverOf(guarded, 'a')({}, {}, undefined, info);

    expect(resolve.mock.calls[0][2]).toEqual({});
  });

  test('resolves fields of every kind', async () => {
    const res = await graphql({
      schema: applyGuard(schema, {}),
      source: '{ a async }',
    });

    expect(res).toEqual({ data: { a: 'a', async: 'async' } });
  });

  test('replaces errors thrown and rejected by resolvers with the fallback error', async () => {
    const res = await graphql({
      schema: applyGuard(schema, {}, { fallbackError: 'fallback' }),
      source: '{ throws rejects }',
    });

    expect(res.data).toEqual({ throws: null, rejects: null });
    expect(res.errors?.map((e) => e.message)).toEqual(['fallback', 'fallback']);
  });

  test('passes resolver errors to a fallbackError function', async () => {
    const fallbackError = vi.fn(async (_err: unknown) => new Error('mapped'));
    const res = await graphql({
      schema: applyGuard(schema, {}, { fallbackError }),
      source: '{ throws rejects }',
    });

    expect(res.errors?.map((e) => e.message)).toEqual(['mapped', 'mapped']);
    expect(
      fallbackError.mock.calls.map(([err]) => (err as Error).message),
    ).toEqual(['internal', 'internal']);
  });

  test('returns resolver errors with allowExternalErrors', async () => {
    const res = await graphql({
      schema: applyGuard(schema, {}, { allowExternalErrors: true }),
      source: '{ throws rejects }',
    });

    expect(res.errors?.map((e) => e.message)).toEqual(['internal', 'internal']);
  });

  test('rethrows resolver errors in debug mode', async () => {
    const res = await graphql({
      schema: applyGuard(schema, {}, { debug: true }),
      source: '{ throws rejects }',
    });

    expect(res.errors?.map((e) => e.message)).toEqual(['internal', 'internal']);
  });
});
