import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { allow, deny, rule } from '../src';
import { ValidationError } from '../src/validation';
import { applyGuard } from './helpers';

// A second, separate instance of the package, like an app that loads both the
// ESM and the CommonJS build.
vi.resetModules();
const otherCopy = await import('../src/index');

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

  test('inputRule and deny are enforced', async () => {
    const guarded = applyGuard(schema, {
      Query: allow,
      Mutation: {
        signup: otherCopy.inputRule()((z) => z.object({ email: z.email() })),
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

describe('values that are not rules', () => {
  const schema = makeExecutableSchema({
    typeDefs: 'type Query { a: String b: String }',
    resolvers: { Query: { a: () => 'a', b: () => 'b' } },
  });

  // Same shape and class name as a graphql-shield rule, but not a
  // graphql-guard rule.
  class Rule {
    name = 'shield-rule';
    resolve = async () => true;
  }

  test.each([
    ['a graphql-shield rule', { Query: { a: new Rule() } }, 'Query.a'],
    ['a string', { Query: { a: 'allow' } }, 'Query.a'],
    ['a function', { Query: { a: () => true } }, 'Query.a'],
    ['a class instance as a type', { Query: new Rule() }, 'Query'],
    ['a non-object rule tree', 'allow', 'the rule tree'],
  ])('throws for %s', (_label, rules, path) => {
    expect(() => applyGuard(schema, rules as never)).toThrow(
      new ValidationError(
        `It seems like ${path} is not a graphql-guard rule. Create rules with rule(), inputRule(), allow, deny or the logic rules from graphql-guard. Rules created with graphql-shield are not supported.`,
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
  const schema = makeExecutableSchema({
    typeDefs:
      'type Query { constructor: String toString: String hasOwnProperty: String other: String }',
    resolvers: {
      Query: {
        constructor: () => 'constructor',
        toString: () => 'toString',
        hasOwnProperty: () => 'hasOwnProperty',
        other: () => 'other',
      },
    },
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
