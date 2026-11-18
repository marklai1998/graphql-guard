import type * as z from 'zod';
import { allow, and, chain, deny, not, or, rule } from '../src/constructors.js';
import {
  Rule,
  RuleAnd,
  RuleChain,
  RuleFalse,
  RuleNot,
  RuleOr,
  RuleTrue,
} from '../src/rules.js';
import { InputRule, inputRule } from '../src/zod.js';

describe('rule constructor', () => {
  test('correctly constructs from no arguments', async () => {
    const func = () => true;
    const result = rule()(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expect(result).toEqual(new Rule(result.name, func, {}));
  });

  test('gives every anonymous rule a distinct, sequential name', async () => {
    const a = rule()(() => true);
    const b = rule()(() => true);
    const c = rule({ cache: 'strict' })(() => true);

    const n = Number(a.name.split('-').at(-1));
    expect(b.name).toBe(`anonymous-rule-${n + 1}`);
    expect(c.name).toBe(`anonymous-rule-${n + 2}`);
  });

  test('correctly constructs with name and options', async () => {
    const func = () => true;

    expect(
      rule('name', {
        cache: 'contextual',
      })(func),
    ).toEqual(new Rule('name', func, { cache: 'contextual' }));
  });

  test('correctly constructs with name but no options', async () => {
    const func = () => true;

    expect(rule('name')(func)).toEqual(new Rule('name', func, {}));
  });

  test('correctly constructs with options', async () => {
    const func = () => true;
    const result = rule({ cache: 'contextual' })(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expect(result).toEqual(
      new Rule(result.name, func, {
        cache: 'contextual',
      }),
    );
  });
});

describe('input rules constructor', () => {
  test('correnctly constructs an input rule with name', async () => {
    const name = Math.random().toString();
    let schema: z.ZodObject;

    const rule = inputRule(name)((z) => {
      schema = z.object({});
      return schema;
    });
    expect(JSON.stringify(rule)).toEqual(
      JSON.stringify(new InputRule(name, () => schema)),
    );
  });

  test('correnctly constructs an input rule', async () => {
    let schema: z.ZodObject;

    const rule = inputRule()((z) => {
      schema = z.object({});
      return schema;
    });
    expect(rule.name).toMatch(/^anonymous-input-rule-\d+$/);
    expect(JSON.stringify(rule)).toEqual(
      JSON.stringify(new InputRule(rule.name, () => schema)),
    );
  });

  test('correctly contructs an input rule with validation options', async () => {
    let schema: z.ZodObject;
    const options = { reportInput: true };

    const rule = inputRule()((z) => {
      schema = z.object({});
      return schema;
    }, options);
    expect(rule.name).toMatch(/^anonymous-input-rule-\d+$/);
    expect(JSON.stringify(rule)).toEqual(
      JSON.stringify(new InputRule(rule.name, () => schema, options)),
    );
  });

  test('infers the schema type', async () => {
    const r = inputRule()((z) => z.object({ email: z.string() }));
    expectTypeOf(r).toEqualTypeOf<InputRule<{ email: string }>>();
  });
});

describe('logic rules constructors', () => {
  test('and correctly constructs rule and', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    expect(and(ruleA, ruleB)).toEqual(new RuleAnd([ruleA, ruleB]));
  });

  test('chain correctly constructs rule chain', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    expect(chain(ruleA, ruleB)).toEqual(new RuleChain([ruleA, ruleB]));
  });

  test('or correctly constructs rule or', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    expect(or(ruleA, ruleB)).toEqual(new RuleOr([ruleA, ruleB]));
  });

  test('not correctly constructs rule not', async () => {
    const ruleA = rule()(() => true);
    expect(not(ruleA)).toEqual(new RuleNot(ruleA));
  });
});

describe('basic rules', () => {
  test('rule allow', async () => {
    expect(allow).toEqual(new RuleTrue());
  });

  test('rule deny', async () => {
    expect(deny).toEqual(new RuleFalse());
  });
});
