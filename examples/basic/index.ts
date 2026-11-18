import { createServer } from 'node:http';
import { and, guard, not, or, rule } from 'graphql-guard';
import { createSchema, createYoga } from 'graphql-yoga';

const typeDefs = /* GraphQL */ `
  type Query {
    frontPage: [Fruit!]!
    fruits: [Fruit!]!
    customers: [Customer!]!
  }

  type Mutation {
    addFruitToBasket: Boolean!
  }

  type Fruit {
    name: String!
    count: Int!
  }

  type Customer {
    id: ID!
    basket: [Fruit!]!
  }
`;

const resolvers = {
  Query: {
    frontPage: () => [
      { name: 'orange', count: 10 },
      { name: 'apple', count: 1 },
    ],
    fruits: () => [
      { name: 'orange', count: 10 },
      { name: 'apple', count: 1 },
      { name: 'strawberries', count: 100 },
    ],
    customers: () => [
      { id: 1, basket: [{ name: 'orange', count: 1 }] },
      { id: 2, basket: [{ name: 'apple', count: 2 }] },
    ],
  },
  Mutation: {
    addFruitToBasket: () => true,
  },
};

// Auth

type User = {
  id: number;
  name: string;
  role: 'admin' | 'editor' | 'customer';
};

type Context = {
  user: User | null;
};

const users: Record<string, User> = {
  mathew: { id: 1, name: 'Mathew', role: 'admin' },
  george: { id: 2, name: 'George', role: 'editor' },
  johnny: { id: 3, name: 'Johnny', role: 'customer' },
};

// For demonstration only: the Authorization header is just a user name.
function getUser(request: Request): User | null {
  const auth = request.headers.get('Authorization');
  return (auth && users[auth]) || null;
}

// Rules

const isAuthenticated = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx: Context) => ctx.user !== null,
);

const isAdmin = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx: Context) => ctx.user?.role === 'admin',
);

const isEditor = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx: Context) => ctx.user?.role === 'editor',
);

// Permissions

const schema = guard(createSchema({ typeDefs, resolvers }), {
  Query: {
    frontPage: not(isAuthenticated),
    fruits: and(isAuthenticated, or(isAdmin, isEditor)),
    customers: and(isAuthenticated, isAdmin),
  },
  Mutation: {
    addFruitToBasket: isAuthenticated,
  },
  Customer: isAdmin,
});

// Server

const yoga = createYoga({
  schema,
  context: ({ request }): Context => ({ user: getUser(request) }),
});

createServer(yoga).listen(4000, () => {
  console.log('Server is running on http://localhost:4000/graphql');
});
