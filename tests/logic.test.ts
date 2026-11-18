import { makeExecutableSchema } from '@graphql-tools/schema';
import { type GraphQLResolveInfo, graphql } from 'graphql';
import { chain, race } from '../src/constructors.js';
import { allow, and, deny, not, or, rule } from '../src/index.js';
import { LogicRule } from '../src/rules.js';
import { applyGuard } from './helpers.js';

describe('logic rules', () => {
  test('allow, deny work as expeted', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    // Permissions

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: allow,
        deny: deny,
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
    });
    expect(res.errors?.length).toBe(1);
  });

  test('and works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'ruleError',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const ruleWithError = rule()(async () => {
      throw new Error();
    });

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: and(allow, allow),
        deny: and(allow, deny),
        ruleError: and(allow, ruleWithError),
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    });
    expect(res.errors?.length).toBe(2);
  });

  test('chain works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'error',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowRuleSequence: string[] = [];
    const allowRuleA = rule()(() => {
      allowRuleSequence.push('A');
      return true;
    });
    const allowRuleB = rule()(() => {
      allowRuleSequence.push('B');
      return true;
    });
    const allowRuleC = rule()(() => {
      allowRuleSequence.push('C');
      return true;
    });
    let denyRuleCount = 0;
    const denyRule = rule({})(() => {
      denyRuleCount += 1;
      return false;
    });
    let ruleWithErrorCount = 0;
    const ruleWithError = rule()(() => {
      ruleWithErrorCount += 1;
      throw new Error('error');
    });

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: chain(allowRuleA, allowRuleB, allowRuleC),
        deny: chain(denyRule, denyRule, denyRule),
        ruleError: chain(ruleWithError, ruleWithError, ruleWithError),
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    });
    expect(allowRuleSequence.toString()).toEqual(['A', 'B', 'C'].toString());
    expect(denyRuleCount).toEqual(1);
    expect(ruleWithErrorCount).toEqual(1);
    expect(res.errors?.length).toBe(2);
  });

  test('race chain works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'error',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const allowRuleSequence: string[] = [];
    const denyRuleA = rule()(() => {
      allowRuleSequence.push('A');
      return false;
    });
    const allowRuleB = rule()(() => {
      allowRuleSequence.push('B');
      return true;
    });
    const allowRuleC = rule()(() => {
      allowRuleSequence.push('C');
      return true;
    });
    let denyRuleCount = 0;
    const denyRule = rule({})(() => {
      denyRuleCount += 1;
      return false;
    });
    let ruleWithErrorCount = 0;
    const ruleWithError = rule()(() => {
      ruleWithErrorCount += 1;
      throw new Error('error');
    });

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: race(denyRuleA, allowRuleB, allowRuleC),
        deny: race(denyRule, denyRule, denyRule),
        ruleError: race(ruleWithError, ruleWithError, ruleWithError),
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    });
    expect(allowRuleSequence.toString()).toEqual(['A', 'B'].toString());
    expect(denyRuleCount).toEqual(3);
    expect(ruleWithErrorCount).toEqual(3);
    expect(res.errors?.length).toBe(2);
  });

  test('or works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: or(allow, deny),
        deny: or(deny, deny),
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
    });
    expect(res.errors?.length).toBe(1);
  });

  test('not works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
        resolverError: String
        customRuleError: String
        customRuleErrorString: String
      }
    `;

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'ruleError',
        resolverError: () => {
          throw new Error();
        },
        customRuleError: () => 'customRuleError',
        customRuleErrorString: () => 'customRuleErrorString',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const ruleWithError = rule()(async () => {
      throw new Error();
    });

    const ruleWithCustomError = rule()(async () => {
      return new Error('error_pass');
    });

    const ruleWithCustomErrorString = rule()(async () => {
      return 'error_string_pass';
    });

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        allow: not(deny),
        deny: not(allow),
        ruleError: not(ruleWithError),
        resolverError: not(allow),
        customRuleError: not(ruleWithCustomError),
        customRuleErrorString: not(ruleWithCustomErrorString),
      },
    });

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
        resolverError
        customRuleError
        customRuleErrorString
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
      resolverError: null,
      customRuleError: 'customRuleError',
      customRuleErrorString: 'customRuleErrorString',
    });
    expect(res.errors?.map((err) => err.message)).toEqual([
      'Not Authorised!',
      'Not Authorised!',
      'Not Authorised!',
    ]);
  });

  test('not denies when the wrapped rule throws, however deeply nested', async () => {
    const typeDefs = `
      type Query {
        direct: String
        nested: String
        doubleNot: String
        working: String
      }
    `;
    const resolvers = {
      Query: {
        direct: () => 'secret',
        nested: () => 'secret',
        doubleNot: () => 'secret',
        working: () => 'secret',
      },
    };
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    const isBanned = rule()(async () => {
      throw new Error('db down');
    });
    const isNotBanned = rule()(async () => false);

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        direct: not(isBanned),
        nested: not(and(allow, or(deny, isBanned))),
        doubleNot: not(not(not(isBanned))),
        working: not(isNotBanned),
      },
    });

    const res = await graphql({
      schema: schemaWithPermissions,
      source: '{ direct nested doubleNot working }',
    });

    expect(res.data).toEqual({
      direct: null,
      nested: null,
      doubleNot: null,
      working: 'secret',
    });
  });

  test('a throwing rule outside not() still resolves to false', async () => {
    const typeDefs = `
      type Query {
        a: String
      }
    `;
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { a: () => 'secret' } },
    });
    const throwing = rule()(async () => {
      throw new Error('db down');
    });

    const res = await graphql({
      schema: applyGuard(schema, { Query: { a: or(throwing, allow) } }),
      source: '{ a }',
    });

    expect(res.data).toEqual({ a: 'secret' });
  });

  test('not returns custom error', async () => {
    const typeDefs = `
      type Query {
        not: String
      }
    `;

    const resolvers = {
      Query: {
        not: () => 'not',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        not: not(allow, 'This is a custom not message.'),
      },
    });

    /* Execution */

    const query = `
      query {
        not
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    expect(res.data).toEqual({
      not: null,
    });
    expect(res.errors?.map((err) => err.message)).toEqual([
      'This is a custom not message.',
    ]);
  });
});

describe('internal execution', () => {
  test('logic rule by default resolves to false', async () => {
    const rule = new LogicRule([]);

    const res = await rule.resolve(
      {},
      {},
      { _guard: { cache: {} } },
      {} as GraphQLResolveInfo,
      {
        allowExternalErrors: false,
        debug: false,
        fallbackRule: allow,
        fallbackError: new Error(),
        hashFunction: () => `${Math.random()}`,
      },
    );

    expect(res).toBeFalsy();
  });

  test('rule prevents access when access not permited', async () => {
    const typeDefs = `
      type Query {
        deny: String
      }
    `;

    const resolvers = {
      Query: {
        deny: () => 'deny',
      },
    };

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /* Permissions */

    const ruleDeny = rule()(() => false);

    const schemaWithPermissions = applyGuard(schema, {
      Query: {
        deny: ruleDeny,
      },
    });

    /* Execution */

    const query = `
      query {
        deny
      }
    `;
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    });

    /* Tests */

    expect(res.data).toEqual({
      deny: null,
    });
    expect(res.errors?.length).toBe(1);
  });
});
