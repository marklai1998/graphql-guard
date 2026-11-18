import { ApolloServer } from 'apollo-server-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { applyMiddleware } from 'graphql-middleware';

import { prisma } from './generated/prisma-client';
import { authorization } from './lib/middlewares/authorization';
import { permissions } from './lib/permissions';
import { schema as baseSchema } from './schema';

export const app = express();
app.use(cookieParser());
app.use(authorization());

const schema = applyMiddleware(baseSchema, permissions);
const server = new ApolloServer({
  context: ({ req, res }) => ({
    prisma,
    request: req,
    response: res,
  }),
  schema,
});

server.applyMiddleware({ app, path: '/' });
