import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { rule } from '../src/index.js';
import { applyGuard } from './helpers.js';

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
