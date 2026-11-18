import { GraphQLServer } from 'graphql-yoga';
import { Prisma } from './generated/prisma';
import { permissions } from './permissions';
import { resolvers } from './resolvers';

const server = new GraphQLServer({
  typeDefs: './src/schema.graphql',
  resolvers,
  middlewares: [permissions],
  context: (req) => ({
    ...req,
    db: new Prisma({
      endpoint: process.env.PRISMA_ENDPOINT,
      debug: false,
      secret: process.env.PRISMA_SECRET,
    }),
  }),
});
server.start(() => console.log(`Server is running on http://localhost:4000`));
