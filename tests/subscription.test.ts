import { makeExecutableSchema } from '@graphql-tools/schema';
import { type ExecutionResult, parse, subscribe } from 'graphql';

import { allow, rule } from '../src/index.js';
import { applyGuard } from './helpers.js';

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

test('checks every event against the rule for a subscription with a custom resolve', async () => {
  const eventRule = vi.fn((event: { count: number }) => event.count !== 2);
  const schema = applyGuard(
    makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { ok: () => true },
        Subscription: {
          count: {
            subscribe: async function* () {
              for (const count of [1, 2, 3]) yield { count };
            },
            resolve: (event: { count: number }) => event.count * 10,
          },
        },
      },
    }),
    {
      Query: allow,
      Subscription: {
        // The parent is the root value (undefined) when the client subscribes.
        count: rule()((event) => event === undefined || eventRule(event)),
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
    { count: null },
    { count: 30 },
  ]);
  expect(events.map((event) => event.errors?.map((e) => e.message))).toEqual([
    undefined,
    ['Not Authorised!'],
    undefined,
  ]);
  expect(eventRule.mock.calls.map(([event]) => event)).toEqual([
    { count: 1 },
    { count: 2 },
    { count: 3 },
  ]);
});

test('checks a subscription with a custom resolve when the client subscribes', async () => {
  const subscribeFn = vi.fn();
  const schema = applyGuard(
    makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { ok: () => true },
        Subscription: {
          count: {
            subscribe: async function* () {
              subscribeFn();
              yield { count: 1 };
            },
            resolve: (event: { count: number }) => event.count,
          },
        },
      },
    }),
    {
      Query: allow,
      Subscription: {
        count: rule()((_parent, _args, ctx) => ctx.allowed === true),
      },
    },
  );

  const result = await subscribe({
    schema,
    document: parse('subscription { count }'),
    contextValue: { allowed: false },
  });

  expect(Symbol.asyncIterator in result).toBe(false);
  expect(
    (result as ExecutionResult).errors?.map((error) => error.message),
  ).toEqual(['Not Authorised!']);
  expect(subscribeFn).not.toHaveBeenCalled();
});
