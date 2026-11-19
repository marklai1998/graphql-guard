import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { rule } from '../src/index.js';
import { inputRule } from '../src/zod.js';
import { applyGuard } from './helpers.js';

describe('input rule', () => {
  test('schema validation works as expected', async () => {
    const typeDefs = `
      type Query {
        hello: String!
      }

      type Mutation {
        login(email: String!): String
      }
    `;

    const resolvers = {
      Query: {
        hello: () => 'world',
      },
      Mutation: {
        login: () => 'pass',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    // Permissions

    const schemaWithPermissions = applyGuard(schema, {
      Mutation: {
        login: inputRule()((z) =>
          z.object({
            email: z.email('It has to be an email!'),
          }),
        ),
      },
    });

    /* Execution */

    const query = `
      mutation {
        success: login(email: "shield@graphql.com")
        failure: login(email: "notemail")
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      success: 'pass',
      failure: null,
    });
    expect(res.errors).toMatchSnapshot();
  });
});

describe('input rule errors', () => {
  test('returns the first issue message with the ZodError as cause', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Query {
          hello: String!
        }

        type Mutation {
          signup(email: String!, age: Int!): String
        }
      `,
      resolvers: {
        Query: { hello: () => 'world' },
        Mutation: { signup: () => 'pass' },
      },
    });

    const res = await graphql({
      schema: applyGuard(schema, {
        Mutation: {
          signup: inputRule()((z) =>
            z.object({
              email: z.email('It has to be an email!'),
              age: z.number().min(18, 'Must be an adult!'),
            }),
          ),
        },
      }),
      source: 'mutation { signup(email: "notemail", age: 3) }',
    });

    expect(res.data).toEqual({ signup: null });
    expect(res.errors).toHaveLength(1);
    const [error] = res.errors ?? [];
    expect(error.message).toBe('It has to be an email!');

    const cause = (error.originalError as Error).cause as {
      issues: { message: string }[];
    };
    expect(cause.issues.map((issue) => issue.message)).toEqual([
      'It has to be an email!',
      'Must be an adult!',
    ]);
  });
});

describe('rules with an unhashable parent', () => {
  const typeDefs = `
    type Query {
      user: User!
    }

    type User {
      greet(name: String!): String
      posts: [String!]!
    }
  `;
  // ORMs and loaders often put lazy fields like this on the parent.
  const resolvers = {
    Query: {
      user: () => ({
        posts: Promise.resolve([]),
        meta: new WeakMap(),
      }),
    },
    User: {
      greet: (_: unknown, { name }: { name: string }) => `hi ${name}`,
    },
  };

  test('inputRule validates the input instead of denying it', async () => {
    const validate = vi.fn();
    const schema = applyGuard(makeExecutableSchema({ typeDefs, resolvers }), {
      User: {
        greet: inputRule()((z) => {
          validate();
          return z.object({ name: z.string().min(2, 'Too short!') });
        }),
      },
    });

    const res = await graphql({
      schema,
      source: `{
        user {
          a: greet(name: "bob")
          b: greet(name: "bob")
          c: greet(name: "x")
        }
      }`,
      contextValue: {},
    });

    expect(res.data).toEqual({
      user: { a: 'hi bob', b: 'hi bob', c: null },
    });
    expect(res.errors?.map((error) => error.message)).toEqual(['Too short!']);
    // Cached by args alone, so the repeated "bob" check runs once.
    expect(validate).toHaveBeenCalledTimes(2);
  });

  test('a strict rule runs uncached instead of denying', async () => {
    const allow = vi.fn().mockResolvedValue(true);
    const schema = applyGuard(makeExecutableSchema({ typeDefs, resolvers }), {
      User: { greet: rule({ cache: 'strict' })(allow) },
    });

    const res = await graphql({
      schema,
      source: '{ user { greet(name: "bob") } }',
      contextValue: {},
    });

    expect(res).toEqual({ data: { user: { greet: 'hi bob' } } });
    expect(allow).toHaveBeenCalledTimes(1);
  });

  test('a rule runs uncached when its cache key function throws', async () => {
    const allow = vi.fn().mockResolvedValue(true);
    const schema = applyGuard(makeExecutableSchema({ typeDefs, resolvers }), {
      User: {
        greet: rule({
          cache: () => {
            throw new Error('no key');
          },
        })(allow),
      },
    });

    const res = await graphql({
      schema,
      source: '{ user { greet(name: "bob") } }',
      contextValue: {},
    });

    expect(res).toEqual({ data: { user: { greet: 'hi bob' } } });
    expect(allow).toHaveBeenCalledTimes(1);
  });
});
