import { makeExecutableSchema } from '@graphql-tools/schema';
import { type ExecutionResult, parse, subscribe } from 'graphql';

import { allow, rule } from '../src';
import { applyGuard } from './helpers';

const typeDefs = /* GraphQL */ `
  type Query {
    ok: Boolean
  }

  type Subscription {
    count: Int
  }
`;

const createSchema = (subscribeRule = vi.fn()) =>
  applyGuard(
    makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { ok: () => true },
        Subscription: {
          count: {
            subscribe: async function* () {
              for (const count of [1, 2, 3]) yield { count };
            },
          },
        },
      },
    }),
    {
      Query: allow,
      Subscription: {
        count: rule()((_parent, _args, ctx) => {
          subscribeRule();
          return ctx.allowed === true;
        }),
      },
    },
  );

const run = async (
  schema: ReturnType<typeof createSchema>,
  contextValue: object,
) =>
  subscribe({
    schema,
    document: parse('subscription { count }'),
    contextValue,
  });

describe('subscriptions', () => {
  test('streams events when the rule allows the subscription', async () => {
    const result = await run(createSchema(), { allowed: true });

    expect(Symbol.asyncIterator in result).toBe(true);
    const events: ExecutionResult[] = [];
    for await (const event of result as AsyncIterable<ExecutionResult>) {
      events.push(event);
    }
    expect(events.map((event) => event.data)).toEqual([
      { count: 1 },
      { count: 2 },
      { count: 3 },
    ]);
  });

  test('rejects the subscription when the rule denies it', async () => {
    const result = await run(createSchema(), { allowed: false });

    expect(Symbol.asyncIterator in result).toBe(false);
    expect(
      (result as ExecutionResult).errors?.map((error) => error.message),
    ).toEqual(['Not Authorised!']);
  });

  test('checks the rule once when subscribing, not for every event', async () => {
    const subscribeRule = vi.fn();
    const result = await run(createSchema(subscribeRule), { allowed: true });

    for await (const _event of result as AsyncIterable<ExecutionResult>) {
      // drain all events
    }
    expect(subscribeRule).toHaveBeenCalledTimes(1);
  });
});

test('checks the rule once for a subscription with a custom resolve', async () => {
  const subscribeRule = vi.fn();
  const resolveEvent = vi.fn((event: { count: number }) => event.count * 10);
  const schema = applyGuard(
    makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { ok: () => true },
        Subscription: {
          count: {
            subscribe: async function* () {
              for (const count of [1, 2]) yield { count };
            },
            resolve: resolveEvent,
          },
        },
      },
    }),
    {
      Query: allow,
      Subscription: {
        count: rule()(() => {
          subscribeRule();
          return true;
        }),
      },
    },
  );

  const result = await subscribe({
    schema,
    document: parse('subscription { count }'),
    contextValue: {},
  });
  const events: ExecutionResult[] = [];
  for await (const event of result as AsyncIterable<ExecutionResult>) {
    events.push(event);
  }

  expect(events.map((event) => event.data)).toEqual([
    { count: 10 },
    { count: 20 },
  ]);
  expect(subscribeRule).toHaveBeenCalledTimes(1);
});
