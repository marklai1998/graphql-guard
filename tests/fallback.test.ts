import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import {
  allow,
  and,
  chain,
  defaultFallbackError,
  deny,
  not,
  or,
  race,
  rule,
} from '../src/index.js';
import { applyGuard } from './helpers.js';

describe('fallbackError correctly handles errors', () => {
  test('error in resolver returns fallback error.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;
    const resolvers = {
      Query: {
        test: async () => {
          throw new Error();
        },
      },
    };

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    /* Permissions */

    const fallbackError = new Error('fallback');

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        fallbackError,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(fallbackError.message);
  });

  test('error in rule returns fallback error.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const fallbackError = new Error('fallback');

    const allow = rule()(() => {
      throw new Error();
    });

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        fallbackError,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(fallbackError.message);
  });

  test('correctly converts string fallbackError to error fallbackError', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const resolvers = {
      Query: {
        test: () => {
          throw new Error();
        },
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const fallbackMessage = Math.random().toString();

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        fallbackError: fallbackMessage,
      },
    );

    /* Execution */
    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(fallbackMessage);
  });

  test('error in rule can be mapped.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const fallbackError = () => new Error('fallback');

    const allow = rule()(() => {
      throw new Error();
    });

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        fallbackError,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(fallbackError().message);
  });

  test('error in resolver can be mapped.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;
    const resolvers = {
      Query: {
        test: async () => {
          throw new Error();
        },
      },
    };

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    /* Permissions */

    const fallbackError = () => new Error('fallback');

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        fallbackError,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(fallbackError().message);
  });
});

describe('external errors can be controled correctly', () => {
  test('error in resolver with allowExternalErrors returns external error.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const resolvers = {
      Query: {
        test: () => {
          throw new Error('external');
        },
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        allowExternalErrors: true,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe('external');
  });

  test('a non-Error thrown in a resolver with allowExternalErrors is not returned as data.', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Query {
          a: String
        }
      `,
      resolvers: {
        Query: {
          a: () => {
            throw 'internal: db password=x';
          },
        },
      },
    });

    const res = await graphql({
      schema: applyGuard(
        schema,
        { Query: allow },
        { allowExternalErrors: true },
      ),
      source: '{ a }',
    });

    expect(res.data).toEqual({ a: null });
    expect(res.errors?.[0]?.message).toBe('Unexpected error value');
    expect(res.errors?.[0]?.originalError?.cause).toBe(
      'internal: db password=x',
    );
    expect(JSON.stringify(res)).not.toContain('password');
  });

  test('error in rule with allowExternalErrors returns fallback.', async () => {
    /* Schema */
    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const allow = rule()(() => {
      throw new Error('external');
    });

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        allowExternalErrors: true,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe('Not Authorised!');
  });
});

describe('debug mode works as expected', () => {
  test('returns original error in debug mode when rule error occurs', async () => {
    /* Schema */
    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const allow = rule()(() => {
      throw new Error('debug');
    });

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        debug: true,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe('debug');
  });

  test('returns original error in debug mode when resolver error occurs.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const resolvers = {
      Query: {
        test: () => {
          throw new Error('debug');
        },
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: allow,
      },
      {
        debug: true,
      },
    );

    /* Execution */

    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe('debug');
  });
});

describe('custom errors work as expected', () => {
  test('custom error in rule returns custom error.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const error = new Error(`${Math.random()}`);

    const schemaWithPermissions = applyGuard(schema, {
      Query: rule()(() => {
        return error;
      }),
    });

    /* Execution */
    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(error.message);
  });

  test('custom error message in rule returns custom error.', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        test: String!
      }
    `;

    const schema = makeExecutableSchema({ typeDefs, resolvers: {} });

    /* Permissions */

    const error = `${Math.random()}`;

    const schemaWithPermissions = applyGuard(schema, {
      Query: rule()(() => {
        return error;
      }),
    });

    /* Execution */
    const query = `
      query {
        test
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.message).toBe(error);
  });
});

describe('fallbackRule correctly applies fallback rule', () => {
  test('correctly applies fallback rule on undefined fields', async () => {
    /* Schema */

    const typeDefs = `
      type Query {
        a: String
        b: String
        type: Type
      }

      type Type {
        a: String
        b: String
      }
    `;

    const resolvers = {
      Query: {
        a: () => 'a',
        b: () => 'b',
        type: () => ({}),
      },
      Type: {
        a: () => 'a',
        b: () => 'b',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const fallbackRuleMock = vi.fn().mockResolvedValue(true);
    const fallbackRule = rule({ cache: 'no_cache' })(fallbackRuleMock);

    const schemaWithPermissions = applyGuard(
      schema,
      {
        Query: {
          a: allow,
          type: allow,
        },
      },
      {
        fallbackRule: fallbackRule,
      },
    );

    /* Execution */

    const query = `
      query {
        a
        b
        type {
          a
          b
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
          a: 'a',
          b: 'b',
        },
      },
    });
    expect(fallbackRuleMock).toBeCalledTimes(3);
  });
});

describe('defaultFallbackError', () => {
  const schema = makeExecutableSchema({
    typeDefs: `
      type Query {
        open: String
        closed: String
      }
    `,
    resolvers: {
      Query: {
        open: () => 'open',
        closed: () => 'closed',
      },
    },
  });

  test('is the error returned when no fallbackError is set', async () => {
    const res = await graphql({
      schema: applyGuard(schema, { Query: { open: allow, closed: deny } }),
      source: '{ open closed }',
    });

    expect(res.data).toEqual({ open: 'open', closed: null });
    expect(res.errors).toHaveLength(1);
    const [error] = res.errors ?? [];
    expect(error.message).toBe('Not Authorised!');
    expect(error.originalError).toBe(defaultFallbackError);
  });

  test('can be reused in a custom fallbackError', async () => {
    const res = await graphql({
      schema: applyGuard(
        schema,
        { Query: { open: allow, closed: deny } },
        {
          fallbackError: async (thrown) =>
            thrown instanceof Error ? thrown : defaultFallbackError,
        },
      ),
      source: '{ open closed }',
    });

    expect(res.data).toEqual({ open: 'open', closed: null });
    const [error] = res.errors ?? [];
    expect(error.originalError).toBe(defaultFallbackError);
  });
});

describe('options', () => {
  test('a string fallbackError does not mutate the passed options', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { closed: String }',
      resolvers: { Query: { closed: () => 'closed' } },
    });
    const options = { fallbackError: 'Denied!' };

    const res = await graphql({
      schema: applyGuard(schema, { Query: deny }, options),
      source: '{ closed }',
    });

    expect(res.errors?.map((error) => error.message)).toEqual(['Denied!']);
    expect(options).toEqual({ fallbackError: 'Denied!' });
  });
});

describe('fallbackError receives errors thrown by rules', () => {
  const schema = makeExecutableSchema({
    typeDefs: `
      type Query {
        test: String
      }
    `,
    resolvers: { Query: { test: () => 'ok' } },
  });

  const run = async (testRule: Parameters<typeof applyGuard>[1]) => {
    const fallbackError = vi.fn((_err: unknown) => new Error('fallback'));
    const res = await graphql({
      schema: applyGuard(schema, { Query: { test: testRule } } as never, {
        fallbackError,
      }),
      source: '{ test }',
    });
    return { res, fallbackError };
  };

  const thrown = new Error('database down');
  const throws = rule()(() => {
    throw thrown;
  });
  const throwsAsync = rule()(async () => {
    throw thrown;
  });
  const allowed = rule()(() => true);
  const denied = rule()(() => false);

  test.each([
    ['a rule', throws],
    ['an async rule', throwsAsync],
    ['and()', and(allowed, throwsAsync)],
    ['chain()', chain(allowed, throwsAsync)],
    ['or()', or(denied, throwsAsync)],
    ['race()', race(denied, throwsAsync)],
    ['not()', not(throws)],
    ['not(not())', not(not(throws))],
  ])('passes the error thrown in %s', async (_, testRule) => {
    const { res, fallbackError } = await run(testRule);

    expect(res.errors?.[0]?.message).toBe('fallback');
    expect(fallbackError).toHaveBeenCalledTimes(1);
    expect(fallbackError.mock.calls[0]?.[0]).toBe(thrown);
  });

  test('passes the first error when several rules throw', async () => {
    const first = new Error('first');
    const { fallbackError } = await run(
      chain(
        rule()(() => {
          throw first;
        }),
        throws,
      ),
    );

    expect(fallbackError.mock.calls[0]?.[0]).toBe(first);
  });

  test('passes null for a plain denial', async () => {
    const { fallbackError } = await run(and(allowed, denied));

    expect(fallbackError.mock.calls[0]?.[0]).toBeNull();
  });

  test('ignores a thrown error when or() still allows', async () => {
    const { res, fallbackError } = await run(or(throws, allowed));

    expect(res.data).toEqual({ test: 'ok' });
    expect(fallbackError).not.toHaveBeenCalled();
  });
});
