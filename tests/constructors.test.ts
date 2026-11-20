import {
  allow,
  and,
  chain,
  deny,
  not,
  or,
  race,
  rule,
} from '../src/constructors.js';
import { ValidationError } from '../src/errors.js';
import {
  Rule,
  RuleAnd,
  RuleChain,
  RuleFalse,
  RuleNot,
  RuleOr,
  RuleTrue,
} from '../src/rules.js';
import type { GuardRule, Rule as RuleType } from '../src/types/index.js';

// A rule's fields are #private, so compare what is observable: the name and,
// through equals(), the rule function.
const expectSameRule = (actual: RuleType, expected: Rule) => {
  expect(actual).toBeInstanceOf(Rule);
  expect(actual.name).toBe(expected.name);
  expect(actual.equals(expected)).toBe(true);
};

describe('rule constructor', () => {
  test('correctly constructs from no arguments', async () => {
    const func = () => true;
    const result = rule()(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expectSameRule(result, new Rule(result.name, func, {}));
  });

  test('keeps the options when the name is undefined', async () => {
    const func = () => true;
    const result = rule(undefined, { cache: 'strict' })(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expectSameRule(result, new Rule(result.name, func, { cache: 'strict' }));
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

    expectSameRule(
      rule('name', { cache: 'contextual' })(func),
      new Rule('name', func, { cache: 'contextual' }),
    );
  });

  test('correctly constructs with name but no options', async () => {
    const func = () => true;

    expectSameRule(rule('name')(func), new Rule('name', func, {}));
  });

  test('correctly constructs with options', async () => {
    const func = () => true;
    const result = rule({ cache: 'contextual' })(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expectSameRule(
      result,
      new Rule(result.name, func, { cache: 'contextual' }),
    );
  });
});

describe('logic rules constructors', () => {
  test('and correctly constructs rule and', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    const result = and(ruleA, ruleB);
    expect(result).toBeInstanceOf(RuleAnd);
    expect(result.getRules()).toEqual([ruleA, ruleB]);
  });

  test('chain correctly constructs rule chain', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    const result = chain(ruleA, ruleB);
    expect(result).toBeInstanceOf(RuleChain);
    expect(result.getRules()).toEqual([ruleA, ruleB]);
  });

  test('or correctly constructs rule or', async () => {
    const ruleA = rule()(() => true);
    const ruleB = rule()(() => true);
    const result = or(ruleA, ruleB);
    expect(result).toBeInstanceOf(RuleOr);
    expect(result.getRules()).toEqual([ruleA, ruleB]);
  });

  test('not correctly constructs rule not', async () => {
    const ruleA = rule()(() => true);
    const result = not(ruleA);
    expect(result).toBeInstanceOf(RuleNot);
    expect(result.getRules()).toEqual([ruleA]);
  });

  test.each([
    ['and', and],
    ['chain', chain],
    ['or', or],
    ['race', race],
  ])('%s throws when called with no rules', (name, logic) => {
    expect(() => logic()).toThrow(
      new ValidationError(
        `${name}() needs at least one rule. Use allow or deny if you meant to allow or deny everything.`,
      ),
    );
  });

  test('and throws when spread from an empty list', () => {
    const rulesFromConfig: GuardRule[] = [];
    expect(() => and(...rulesFromConfig)).toThrow(ValidationError);
  });
});

describe('basic rules', () => {
  test('rule allow', async () => {
    expect(allow).toBeInstanceOf(RuleTrue);
  });

  test('rule deny', async () => {
    expect(deny).toBeInstanceOf(RuleFalse);
  });
});
