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
import type { GuardRule } from '../src/types/index.js';

describe('rule constructor', () => {
  test('correctly constructs from no arguments', async () => {
    const func = () => true;
    const result = rule()(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expect(result).toEqual(new Rule(result.name, func, {}));
  });

  test('keeps the options when the name is undefined', async () => {
    const func = () => true;
    const result = rule(undefined, { cache: 'strict' })(func);

    expect(result.name).toMatch(/^anonymous-rule-\d+$/);
    expect(result).toEqual(new Rule(result.name, func, { cache: 'strict' }));
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
    expect(allow).toEqual(new RuleTrue());
  });

  test('rule deny', async () => {
    expect(deny).toEqual(new RuleFalse());
  });
});
