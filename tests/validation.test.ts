import { makeExecutableSchema } from '@graphql-tools/schema';
import { applyMiddleware } from 'graphql-middleware';
import { allow, guard, rule } from '../src/';
import { and } from '../src/constructors';
import { ValidationError, validateRuleTree } from '../src/validation';

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

    const permissions = guard({
      Query: allow,
      Fail1: allow,
      Fail2: allow,
    });

    expect(() => {
      applyMiddleware(schema, permissions);
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

    const permissions = guard({
      Query: {
        a: allow,
        b: allow,
        c: allow,
      },
    });

    expect(() => {
      applyMiddleware(schema, permissions);
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

    expect(() => {
      guard(incorrectRuleTree);
    }).toThrow(
      `There seem to be multiple definitions of these rules: one, two`,
    );
  });
});
