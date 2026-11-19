import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import { createYoga } from 'graphql-yoga';

import { allow, and, deny, or, rule } from '../src/index.js';
import { inputRule } from '../src/zod.js';
import { applyGuard } from './helpers.js';

/* Users and context */

type User = { id: string; name: string; email: string; role: string };

const users: Record<string, User> = {
  alice: { id: '1', name: 'Alice', email: 'alice@a.co', role: 'admin' },
  bob: { id: '2', name: 'Bob', email: 'bob@b.co', role: 'member' },
};

type Context = { user: User | null };

const contextFromHeader = (authorization: string | null): Context => ({
  user: (authorization && users[authorization]) || null,
});

/* Schema */

const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
    # resolved by the default property resolver
    email: String
  }

  type Query {
    publicInfo: String
    me: User
    team: [User!]!
    adminOnly: String
    broken: String
    hidden: String
  }

  type Mutation {
    signup(email: String!): String
  }
`;

const resolvers = {
  Query: {
    publicInfo: () => 'public',
    me: (_: unknown, __: unknown, ctx: Context) => ctx.user,
    team: () => Object.values(users),
    adminOnly: () => 'admin',
    broken: () => {
      throw new Error('database password leaked');
    },
    hidden: () => 'hidden',
  },
  Mutation: {
    signup: () => 'signed up',
  },
};

/* Rules */

const isAuthenticated = rule({ cache: 'contextual' })(
  (_parent, _args, ctx: Context) => ctx.user !== null,
);
const isAdmin = rule({ cache: 'contextual' })(
  (_parent, _args, ctx: Context) => ctx.user?.role === 'admin',
);
const isSelf = rule({ cache: 'strict' })(
  (parent: User, _args, ctx: Context) => ctx.user?.id === parent.id,
);

const createGuardedSchema = (): GraphQLSchema =>
  applyGuard(
    makeExecutableSchema({ typeDefs, resolvers }),
    {
      Query: {
        publicInfo: allow,
        me: isAuthenticated,
        team: isAuthenticated,
        adminOnly: and(isAuthenticated, isAdmin),
        broken: allow,
      },
      User: {
        id: allow,
        name: allow,
        email: or(isAdmin, isSelf),
      },
      Mutation: {
        signup: inputRule()((z) =>
          z.object({ email: z.email('It has to be an email!') }),
        ),
      },
    },
    { fallbackRule: deny },
  );

/* Servers */

type Result = {
  data?: Record<string, unknown> | null;
  errors?: {
    message: string;
    path?: (string | number)[];
    extensions?: Record<string, unknown>;
  }[];
};

type Execute = (
  query: string,
  options?: { as?: keyof typeof users; variables?: Record<string, unknown> },
) => Promise<Result>;

const servers: { name: string; create: (schema: GraphQLSchema) => Execute }[] =
  [
    {
      name: 'GraphQL Yoga',
      create: (schema) => {
        const yoga = createYoga({
          schema,
          context: ({ request }) =>
            contextFromHeader(request.headers.get('authorization')),
          // Default error masking stays on: guard errors must still reach the client
          logging: false,
        });
        return async (query, { as, variables } = {}) => {
          const response = await yoga.fetch('http://yoga/graphql', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(as ? { authorization: as } : {}),
            },
            body: JSON.stringify({ query, variables }),
          });
          return response.json() as Promise<Result>;
        };
      },
    },
    {
      name: 'Apollo Server',
      create: (schema) => {
        const server = new ApolloServer<Context>({ schema });
        return async (query, { as, variables } = {}) => {
          const response = await server.executeOperation(
            { query, variables },
            { contextValue: contextFromHeader(as ?? null) },
          );
          if (response.body.kind !== 'single') {
            throw new Error('Expected a single result');
          }
          const { data, errors } = response.body.singleResult;
          return { data, errors } as Result;
        };
      },
    },
  ];

const messages = (result: Result) =>
  (result.errors ?? []).map((error) => error.message);

describe.each(servers)('$name', ({ create }) => {
  const execute = create(createGuardedSchema());

  test('allows public fields and denies protected ones with the default error', async () => {
    const result = await execute('{ publicInfo adminOnly }');

    expect(result.data).toEqual({ publicInfo: 'public', adminOnly: null });
    expect(result.errors).toEqual([
      expect.objectContaining({
        message: 'Not Authorised!',
        extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
    ]);
  });

  test('evaluates rules against each request context', async () => {
    const asAdmin = await execute('{ adminOnly }', { as: 'alice' });
    const asMember = await execute('{ adminOnly }', { as: 'bob' });
    const anonymous = await execute('{ adminOnly }');
    const asAdminAgain = await execute('{ adminOnly }', { as: 'alice' });

    expect(asAdmin.data).toEqual({ adminOnly: 'admin' });
    expect(asMember.data).toEqual({ adminOnly: null });
    expect(anonymous.data).toEqual({ adminOnly: null });
    // contextual cache must not leak between requests
    expect(asAdminAgain.data).toEqual({ adminOnly: 'admin' });
    expect(asAdminAgain.errors).toBeUndefined();
  });

  test('guards fields resolved by the default resolver, per parent', async () => {
    const asMember = await execute('{ team { name email } }', { as: 'bob' });

    expect(asMember.data).toEqual({
      team: [
        { name: 'Alice', email: null },
        { name: 'Bob', email: 'bob@b.co' },
      ],
    });
    expect(asMember.errors).toEqual([
      expect.objectContaining({
        message: 'Not Authorised!',
        path: ['team', 0, 'email'],
      }),
    ]);

    const asAdmin = await execute('{ team { email } }', { as: 'alice' });
    expect(asAdmin.data).toEqual({
      team: [{ email: 'alice@a.co' }, { email: 'bob@b.co' }],
    });
  });

  test('applies fallbackRule to fields without a rule', async () => {
    const result = await execute('{ hidden }', { as: 'alice' });

    expect(result.data).toEqual({ hidden: null });
    expect(messages(result)).toEqual(['Not Authorised!']);
  });

  test('does not guard introspection', async () => {
    const result = await execute(
      '{ __typename __schema { queryType { name } } }',
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      __typename: 'Query',
      __schema: { queryType: { name: 'Query' } },
    });
  });

  test('hides errors thrown in resolvers', async () => {
    const result = await execute('{ broken }');

    expect(result.data).toEqual({ broken: null });
    expect(messages(result)).toEqual(['Not Authorised!']);
  });

  test('validates mutation arguments with inputRule', async () => {
    const mutation = 'mutation ($email: String!) { signup(email: $email) }';

    const valid = await execute(mutation, {
      variables: { email: 'new@user.co' },
    });
    const invalid = await execute(mutation, {
      variables: { email: 'not-an-email' },
    });

    expect(valid.data).toEqual({ signup: 'signed up' });
    expect(invalid.data).toEqual({ signup: null });
    expect(invalid.errors).toEqual([
      expect.objectContaining({
        message: 'It has to be an email!',
        extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
      }),
    ]);
  });

  test('runs fields of one request in parallel without mixing results', async () => {
    const result = await execute(
      '{ publicInfo me { name email } team { email } adminOnly }',
      { as: 'bob' },
    );

    expect(result.data).toEqual({
      publicInfo: 'public',
      me: { name: 'Bob', email: 'bob@b.co' },
      team: [{ email: null }, { email: 'bob@b.co' }],
      adminOnly: null,
    });
    expect(messages(result)).toEqual(['Not Authorised!', 'Not Authorised!']);
  });
});

describe('custom rule errors', () => {
  const schema = applyGuard(makeExecutableSchema({ typeDefs, resolvers }), {
    Query: {
      publicInfo: rule()(() => 'Custom string error'),
      adminOnly: rule()(() => new Error('Custom plain error')),
    },
  });

  test.each(servers)(
    '$name shows string errors from rules',
    async ({ create }) => {
      const result = await create(schema)('{ publicInfo }');
      expect(result.errors).toEqual([
        expect.objectContaining({
          message: 'Custom string error',
          extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      ]);
    },
  );
});
