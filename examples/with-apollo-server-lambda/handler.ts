import { ApolloServer } from '@apollo/server';
import {
  handlers,
  startServerAndCreateLambdaHandler,
} from '@as-integrations/aws-lambda';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { guard, rule } from 'graphql-guard';

type Context = {
  user: string | null;
};

const isAuthenticated = rule()(
  async (_parent, _args, ctx: Context) => ctx.user !== null,
);

// Construct a schema, using GraphQL schema language.
const typeDefs = /* GraphQL */ `
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: (_parent: unknown, _args: unknown, ctx: Context) =>
      `Hello ${ctx.user}!`,
  },
};

const schema = guard(makeExecutableSchema({ typeDefs, resolvers }), {
  Query: {
    hello: isAuthenticated,
  },
});

const server = new ApolloServer<Context>({ schema });

export const graphql = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  {
    // For demonstration only: the Authorization header is just a user name.
    context: async ({ event }) => ({
      user: event.headers.authorization ?? null,
    }),
  },
);
