import { and, rule } from '../src/constructors.js';
import { isLogicRule, isRule, isRuleFunction } from '../src/utils.js';

// Objects from graphql-shield have the same class names but are not rules.
const shieldLike = {
  Rule: class Rule {},
  RuleAnd: class RuleAnd {},
};

// A second, separate instance of the package, like an app that loads both the
// ESM and the CommonJS build. `instanceof` fails across the two copies.
vi.resetModules();
const otherCopy = await import('../src/index.js');

describe('type identifiers', () => {
  test('recognises every rule kind from another copy of graphql-guard', () => {
    const {
      rule: otherRule,
      inputRule,
      and: otherAnd,
      allow,
      deny,
    } = otherCopy;

    expect(otherRule()(() => true)).not.toBeInstanceOf(
      rule()(() => true).constructor,
    );
    expect(isRule(otherRule()(() => true))).toBe(true);
    expect(isRule(inputRule()((z) => z.object({})))).toBe(true);
    expect(isLogicRule(otherAnd())).toBe(true);
    expect(isLogicRule(allow)).toBe(true);
    expect(isLogicRule(deny)).toBe(true);
  });

  test('isRuleFunction finds rule function.', async () => {
    expect(isRuleFunction(rule()(() => true))).toBeTruthy();
    expect(isRuleFunction(and())).toBeTruthy();
    expect(isRuleFunction(false)).toBeFalsy();
  });

  test('isRule finds rule.', async () => {
    expect(isRule(rule()(() => true))).toBeTruthy();
    expect(isRule(and())).toBeFalsy();
    expect(isRule(false)).toBeFalsy();
    expect(isRule(new shieldLike.Rule())).toBeFalsy();
  });

  test('isLogicRule finds logic rule.', async () => {
    expect(isLogicRule(and())).toBeTruthy();
    expect(isLogicRule(rule()(() => true))).toBeFalsy();
    expect(isLogicRule(false)).toBeFalsy();
    expect(isLogicRule(new shieldLike.RuleAnd())).toBeFalsy();
  });
});
