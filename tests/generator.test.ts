import { makeExecutableSchema } from '@graphql-tools/schema';
import { getIntrospectionQuery, graphql } from 'graphql';
import { deny, rule } from '../src/index.js';
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
