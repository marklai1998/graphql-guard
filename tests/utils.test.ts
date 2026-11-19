import * as shield from 'graphql-shield';
import { allow, and, rule } from '../src/constructors.js';
import {
  isAllowRule,
  isLogicRule,
  isRule,
  isRuleFunction,
} from '../src/utils.js';

// Objects with a rule's class name but not its API are not rules.
const nameOnly = {
  Rule: class Rule {},
  RuleAnd: class RuleAnd {},
};

// A second, separate instance of the package, like a monorepo where two
// packages each install graphql-guard. `instanceof` fails across the copies.
vi.resetModules();
const otherCopy = await import('../src/index.js');

describe('type identifiers', () => {
  test('recognises every rule kind from another copy of graphql-guard', () => {
    const { rule: otherRule, and: otherAnd, allow, deny } = otherCopy;

    expect(otherRule()(() => true)).not.toBeInstanceOf(
      rule()(() => true).constructor,
    );
    expect(isRule(otherRule()(() => true))).toBe(true);
    expect(isLogicRule(otherAnd(allow))).toBe(true);
    expect(isLogicRule(allow)).toBe(true);
    expect(isLogicRule(deny)).toBe(true);
  });

  test('recognises graphql-shield rules by their API', () => {
    expect(isRule(shield.rule()(() => true))).toBe(true);
    expect(isLogicRule(shield.and(shield.allow))).toBe(true);
    expect(isLogicRule(shield.allow)).toBe(true);
    expect(isLogicRule(shield.deny)).toBe(true);
  });

  test('isAllowRule only short-circuits this copy of allow', () => {
    expect(isAllowRule(allow)).toBe(true);
    expect(isAllowRule(otherCopy.allow)).toBe(false);
    expect(isAllowRule(shield.allow)).toBe(false);
  });

  test('isRuleFunction finds rule function.', async () => {
    expect(isRuleFunction(rule()(() => true))).toBeTruthy();
    expect(isRuleFunction(and(allow))).toBeTruthy();
    expect(isRuleFunction(false)).toBeFalsy();
  });

  test('isRule finds rule.', async () => {
    expect(isRule(rule()(() => true))).toBeTruthy();
    expect(isRule(and(allow))).toBeFalsy();
    expect(isRule(false)).toBeFalsy();
    expect(isRule(new nameOnly.Rule())).toBeFalsy();
    expect(
      isRule({ name: 'x', resolve: 'not a function', equals() {} }),
    ).toBeFalsy();
  });

  test('isLogicRule finds logic rule.', async () => {
    expect(isLogicRule(and(allow))).toBeTruthy();
    expect(isLogicRule(rule()(() => true))).toBeFalsy();
    expect(isLogicRule(false)).toBeFalsy();
    expect(isLogicRule(new nameOnly.RuleAnd())).toBeFalsy();
  });
});
