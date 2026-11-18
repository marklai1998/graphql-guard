import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { inputRule } from '../src';
import { applyGuard } from './helpers';

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
