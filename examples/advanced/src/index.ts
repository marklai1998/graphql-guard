import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { guard } from 'graphql-guard';
import { createSchema, createYoga } from 'graphql-yoga';
import { db } from './db.js';
import { permissions } from './permissions/index.js';
import { resolvers } from './resolvers/index.js';
import { type Context, getUserEmail } from './utils.js';

const typeDefs = readFileSync(
  new URL('./schema.graphql', import.meta.url),
  'utf8',
);

const schema = guard(createSchema({ typeDefs, resolvers }), permissions);

const yoga = createYoga({
  schema,
  context: ({ request }): Context => ({ db, email: getUserEmail(request) }),
});

createServer(yoga).listen(4000, () => {
  console.log('Server is running on http://localhost:4000/graphql');
});
