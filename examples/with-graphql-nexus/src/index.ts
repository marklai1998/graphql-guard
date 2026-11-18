import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import { type Context, getUserId } from './lib/context.js';
import { db } from './lib/db.js';
import { schema } from './schema/index.js';

const port = Number.parseInt(process.env.PORT ?? '', 10) || 4001;

const yoga = createYoga({
  schema,
  context: ({ request }): Context => ({ db, userId: getUserId(request) }),
});

createServer(yoga).listen(port, () => {
  console.log(`Listening on http://localhost:${port}/graphql`);
});
