import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { and } from '../src/constructors.js';
import { allow, deny, guard, rule } from '../src/index.js';
import { ValidationError, validateRuleTree } from '../src/validation.js';
import { applyGuard } from './helpers.js';

describe('correctly helps developer', () => {
  test('Finds a type missing in schema and warns developer.', async () => {
    /* Schema */

    const typeDefs = `
     type Query {
       a: String!
     }
   `;

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers: {},
    });

    // Permissions

    expect(() => {
      applyGuard(schema, {
        Query: allow,
        Fail1: allow,
        Fail2: allow,
      });
    }).toThrow(
      `It seems like you have applied rules to Fail1, Fail2 types but Guard cannot find them in your schema.`,
    );
  });

  test('Finds the fields missing in schema and warns developer.', async () => {
    // Schema
    const typeDefs = `
     type Query {
       a: String!
     }
   `;

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers: {},
    });

    // Permissions

    expect(() => {
      applyGuard(schema, {
        Query: {
          a: allow,
          b: allow,
          c: allow,
        },
      });
    }).toThrow(
      'It seems like you have applied rules to Query.b, Query.c fields but Guard cannot find them in your schema.',
    );
  });
});

describe('rule tree validation', () => {
  test('validates rules correctly', async () => {
    /* Rules */

    const rule1 = rule('one')(() => true);
    const rule12 = rule('one')(() => true);
    const rule2 = rule('two')(() => true);
    const rule22 = rule('two')(() => true);
    const rule3 = rule()(() => true);
    const rule4 = rule()(() => true);

    const correctRuleTree = {
      Query: {
        foo: rule1,
        bar: rule2,
      },
      Mutation: rule3,
      Bar: rule4,
    };

    const incorrectRuleTree = {
      Query: {
        foo: rule1,
        bar: rule12,
        qux: rule2,
        foobarqux: rule22,
        quxbarfoo: and(rule1, rule12),
      },
      Mutation: rule3,
      Bar: rule4,
    };

    /* Tests */

    expect(() => validateRuleTree(correctRuleTree)).not.toThrow();
    expect(() => validateRuleTree(incorrectRuleTree)).toThrow(ValidationError);
    expect(() => validateRuleTree(incorrectRuleTree)).toThrow(
      new ValidationError(
        'There seem to be multiple definitions of these rules: one, two',
      ),
    );
  });
});

describe('guard works as expected', () => {
  test('throws an error on invalid schema', async () => {
    /* Rules */

    const rule1 = rule('one')(() => true);
    const rule12 = rule('one')(() => true);
    const rule2 = rule('two')(() => true);
    const rule22 = rule('two')(() => true);
    const rule3 = rule()(() => true);
    const rule4 = rule()(() => true);

    const incorrectRuleTree = {
      Query: {
        foo: rule1,
        bar: rule12,
        qux: rule2,
        foobarqux: rule22,
        quxbarfoo: and(rule1, rule12),
      },
      Mutation: rule3,
      Bar: rule4,
    };

    /* Tests */

    const schema = makeExecutableSchema({
      typeDefs: `
        type Query { foo: String bar: String qux: String foobarqux: String quxbarfoo: String }
        type Mutation { a: String }
        type Bar { a: String }
      `,
    });

    expect(() => {
      guard(schema, incorrectRuleTree);
    }).toThrow(
      `There seem to be multiple definitions of these rules: one, two`,
    );
  });
});

describe('rules on non-object types', () => {
  const schema = makeExecutableSchema({
    typeDefs: `
      interface Node { id: ID! secret: String }
      type Item implements Node { id: ID! secret: String }
      union Result = Item
      input ItemInput { secret: String }
      type Query { node: Node items: [Result!]! }
      type Mutation { createItem(input: ItemInput!): Item }
    `,
    resolvers: {
      Node: { __resolveType: () => 'Item' },
      Result: { __resolveType: () => 'Item' },
    },
  });

  test('throws for rules on an interface', () => {
    expect(() =>
      applyGuard(schema, { Query: allow, Node: { secret: allow } }),
    ).toThrow(
      new ValidationError(
        'It seems like you have applied rules to Node types but Guard can only apply rules to object types. Apply them to the object types that implement or belong to them instead.',
      ),
    );
  });

  test('throws for rules on a union', () => {
    expect(() => applyGuard(schema, { Query: allow, Result: allow })).toThrow(
      ValidationError,
    );
  });

  test('throws for rules on an input type', () => {
    expect(() =>
      applyGuard(schema, { Query: allow, ItemInput: { secret: allow } }),
    ).toThrow(
      new ValidationError(
        'It seems like you have applied rules to ItemInput types but Guard can only apply rules to object types. Apply them to the object types that implement or belong to them instead.',
      ),
    );
  });

  test('applies rules to the object types that implement an interface', async () => {
    const guarded = applyGuard(schema, {
      Query: allow,
      Item: { id: allow, secret: deny },
    });
    const result = await graphql({
      schema: guarded,
      source: '{ node { id secret } items { ... on Item { secret } } }',
      rootValue: {
        node: { id: '1', secret: 'a' },
        items: [{ id: '2', secret: 'b' }],
      },
    });

    expect(result.data).toEqual({
      node: { id: '1', secret: null },
      items: [{ secret: null }],
    });
    expect(result.errors?.map((error) => error.message)).toEqual([
      'Not Authorised!',
      'Not Authorised!',
    ]);
  });
});
