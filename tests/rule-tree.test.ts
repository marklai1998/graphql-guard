import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import * as shield from 'graphql-shield';
import { allow, and, deny, type GuardRule, rule } from '../src/index.js';
import { ValidationError } from '../src/validation.js';
import { applyGuard } from './helpers.js';

// A second, separate instance of the package, like a monorepo where two
// packages each install graphql-guard.
vi.resetModules();
const otherCopy = await import('../src/index.js');

const execute = async (
  schema: ReturnType<typeof applyGuard>,
  source: string,
) => {
  const result = await graphql({ schema, source, contextValue: {} });
  return {
    data: result.data,
    errors: result.errors?.map((error) => error.message),
  };
};

describe('rules from another copy of graphql-guard', () => {
  const schema = makeExecutableSchema({
    typeDefs: `
      type Query { ok: String }
      type Mutation {
        signup(email: String!): String
        closed: String
      }
    `,
    resolvers: {
      Query: { ok: () => 'ok' },
      Mutation: { signup: () => 'signed up', closed: () => 'closed' },
    },
  });

  test('rule and deny are enforced', async () => {
    const guarded = applyGuard(schema, {
      Query: allow,
      Mutation: {
        signup: otherCopy.rule()((_parent, args) => args.email.includes('@')),
        closed: otherCopy.deny,
      },
    });

    expect(
      await execute(
        guarded,
        'mutation { signup(email: "not-an-email") closed }',
      ),
    ).toEqual({
      data: { signup: null, closed: null },
      errors: [expect.any(String), 'Not Authorised!'],
    });
    expect(
      await execute(guarded, 'mutation { signup(email: "a@b.co") }'),
    ).toEqual({ data: { signup: 'signed up' }, errors: undefined });
  });
});

describe('rules from graphql-shield', () => {
  const schema = makeExecutableSchema({
    typeDefs: 'type Query { open: String closed: String mixed: String }',
    resolvers: {
      Query: {
        open: () => 'open',
        closed: () => 'closed',
        mixed: () => 'mixed',
      },
    },
  });

  test('are enforced, alone and inside graphql-guard logic rules', async () => {
    // graphql-shield's types expect its own options (allowExternalErrors and
    // a required hashFunction), so they need a cast; at runtime the API is
    // the same.
    const isAdmin = shield.rule()(
      (_p, _a, ctx: { admin?: boolean }) => ctx.admin === true,
    ) as unknown as GuardRule;
    const guarded = applyGuard(schema, {
      Query: {
        open: shield.allow as unknown as GuardRule,
        closed: shield.and(shield.deny) as unknown as GuardRule,
        mixed: and(allow, isAdmin),
      },
    });

    expect(await execute(guarded, '{ open }')).toEqual({
      data: { open: 'open' },
      errors: undefined,
    });
    expect(await execute(guarded, '{ closed }')).toEqual({
      data: { closed: null },
      errors: ['Not Authorised!'],
    });
    expect(await execute(guarded, '{ mixed }')).toEqual({
      data: { mixed: null },
      errors: ['Not Authorised!'],
    });
  });
});

describe('values that are not rules', () => {
  const schema = makeExecutableSchema({
    typeDefs: 'type Query { a: String b: String }',
    resolvers: { Query: { a: () => 'a', b: () => 'b' } },
  });

  // Same class name as a rule, but without the rule API (no equals).
  class Rule {
    name = 'incomplete-rule';
    resolve = async () => true;
  }

  test.each([
    [
      'an object missing part of the rule API',
      { Query: { a: new Rule() } },
      'Query.a',
    ],
    ['a string', { Query: { a: 'allow' } }, 'Query.a'],
    ['a function', { Query: { a: () => true } }, 'Query.a'],
    ['a class instance as a type', { Query: new Rule() }, 'Query'],
    ['a non-object rule tree', 'allow', 'the rule tree'],
  ])('throws for %s', (_label, rules, path) => {
    expect(() => applyGuard(schema, rules as never)).toThrow(
      new ValidationError(
        `It seems like ${path} is not a rule. Create rules with rule(), allow, deny or the logic rules from graphql-guard.`,
      ),
    );
  });

  test('does not fall back for the other fields of the type', () => {
    // Before, one invalid value replaced the whole field map with the
    // fallback rule, which lets everything through by default.
    expect(() =>
      applyGuard(schema, { Query: { a: deny, b: 'oops' as never } }),
    ).toThrow(ValidationError);
  });
});

describe('names of built-in object properties', () => {
  // A plain record, so TypeScript accepts `constructor` as a resolver name
  const queryResolvers: Record<string, () => string> = {
    constructor: () => 'constructor',
    toString: () => 'toString',
    hasOwnProperty: () => 'hasOwnProperty',
    other: () => 'other',
  };
  const schema = makeExecutableSchema({
    typeDefs:
      'type Query { constructor: String toString: String hasOwnProperty: String other: String }',
    resolvers: { Query: queryResolvers },
  });
  const source = '{ constructor toString hasOwnProperty other }';

  test('fields without a rule use fallbackRule', async () => {
    expect(
      await execute(applyGuard(schema, { Query: { other: deny } }), source),
    ).toEqual({
      data: {
        constructor: 'constructor',
        toString: 'toString',
        hasOwnProperty: 'hasOwnProperty',
        other: null,
      },
      errors: ['Not Authorised!'],
    });
  });

  test('types without a rule use fallbackRule', async () => {
    const typeSchema = makeExecutableSchema({
      typeDefs:
        'type constructor { value: String } type Query { item: constructor }',
      resolvers: { Query: { item: () => ({ value: 'value' }) } },
    });

    expect(
      await execute(
        applyGuard(typeSchema, { Query: allow }, { fallbackRule: allow }),
        '{ item { value } }',
      ),
    ).toEqual({ data: { item: { value: 'value' } }, errors: undefined });
  });

  test('a rule named constructor is evaluated, not read from the cache', async () => {
    const isAllowed = vi.fn(() => true);
    const guarded = applyGuard(schema, {
      Query: rule('constructor', { cache: 'contextual' })(isAllowed),
    });

    expect(await execute(guarded, '{ other }')).toEqual({
      data: { other: 'other' },
      errors: undefined,
    });
    expect(isAllowed).toHaveBeenCalledTimes(1);
  });
});
