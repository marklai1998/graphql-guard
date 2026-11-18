import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServer, gql } from 'apollo-server-lambda';
import { applyMiddleware } from 'graphql-middleware';
import { rule, shield } from 'graphql-shield';

const isAuthenticated = rule()(async (parent, args, ctx, info) => {
  return ctx.user;
});

// Construct a schema, using GraphQL schema language.
const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello world!',
  },
};

const permissions = shield({
  Query: {
    hello: isAuthenticated,
  },
});

const schema = applyMiddleware(
  makeExecutableSchema({
    typeDefs,
    resolvers,
  }),
  permissions,
);

const server = new ApolloServer({
  schema,
  cors: {
    origin: '*',
    methods: 'GET,HEAD,POST',
  },
});

export const graphql = server.createHandler();
