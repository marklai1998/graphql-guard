import { LogicRule, Rule } from './rules.js';
import type {
  GuardRule,
  LogicRule as LogicRuleType,
  RuleFieldMap,
  Rule as RuleType,
} from './types.js';

export const isRule = (x: any): x is RuleType => {
  return x instanceof Rule || (x?.constructor && x.constructor.name === 'Rule');
};

export const isLogicRule = (x: any): x is LogicRuleType => {
  return (
    x instanceof LogicRule ||
    (x?.constructor &&
      (x.constructor.name === 'RuleOr' ||
        x.constructor.name === 'RuleAnd' ||
        x.constructor.name === 'RuleChain' ||
        x.constructor.name === 'RuleRace' ||
        x.constructor.name === 'RuleNot' ||
        x.constructor.name === 'RuleTrue' ||
        x.constructor.name === 'RuleFalse'))
  );
};

export const isRuleFunction = (x: any): x is GuardRule => {
  return isRule(x) || isLogicRule(x);
};

export const isRuleFieldMap = (x: any): x is RuleFieldMap => {
  return (
    typeof x === 'object' &&
    Object.values(x).every((rule) => isRuleFunction(rule))
  );
};

export const flattenObjectOf = <T>(
  obj: { [key: string]: any },
  f: (x: any) => boolean,
): T[] => {
  const values = Object.keys(obj).reduce<T[]>((acc, key) => {
    const val = obj[key];
    if (f(val)) {
      return [...acc, val];
    } else if (typeof val === 'object' && !f(val)) {
      return [...acc, ...flattenObjectOf(val, f)];
    } else {
      return acc;
    }
  }, []);
  return values;
};
