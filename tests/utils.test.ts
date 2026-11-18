import { and, rule } from '../src/constructors';
import {
  isLogicRule,
  isRule,
  isRuleFieldMap,
  isRuleFunction,
} from '../src/utils';

// Rules created by another copy of the library (e.g. a duplicate install)
// fail `instanceof`, so they are recognised by class name instead.
const foreignRules = {
  Rule: class Rule {},
  RuleAnd: class RuleAnd {},
};
const testSimpleRule = new foreignRules.Rule();
const testLogicRule = new foreignRules.RuleAnd();

describe('type identifiers', () => {
  test('isRuleFunction finds rule function.', async () => {
    expect(isRuleFunction(rule()(() => true))).toBeTruthy();
    expect(isRuleFunction(and())).toBeTruthy();
    expect(isRuleFunction(false)).toBeFalsy();
  });

  test('isRule finds rule.', async () => {
    expect(isRule(rule()(() => true))).toBeTruthy();
    expect(isRule(and())).toBeFalsy();
    expect(isRule(false)).toBeFalsy();
    expect(isRule(testSimpleRule)).toBeTruthy();
  });

  test('isLogicRule finds logic rule.', async () => {
    expect(isLogicRule(and())).toBeTruthy();
    expect(isLogicRule(rule()(() => true))).toBeFalsy();
    expect(isLogicRule(false)).toBeFalsy();
    expect(isLogicRule(testLogicRule)).toBeTruthy();
  });

  test('isRuleFieldMap finds rule field map.', async () => {
    expect(
      isRuleFieldMap({
        foo: rule()(() => true),
        bar: and(),
      }),
    ).toBeTruthy();

    expect(
      isRuleFieldMap({
        foo: rule()(() => true),
        bar: false,
      }),
    ).toBeFalsy();
  });
});
