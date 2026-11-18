import { LogicRule, Rule } from './rules.js';
import type { ILogicRule, IRule, IRuleFieldMap, ShieldRule } from './types.js';

export function isRule(x: any): x is IRule {
  return x instanceof Rule || (x?.constructor && x.constructor.name === 'Rule');
}

export function isLogicRule(x: any): x is ILogicRule {
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
}

export function isRuleFunction(x: any): x is ShieldRule {
  return isRule(x) || isLogicRule(x);
}

export function isRuleFieldMap(x: any): x is IRuleFieldMap {
  return (
    typeof x === 'object' &&
    Object.values(x).every((rule) => isRuleFunction(rule))
  );
}

export function flattenObjectOf<T>(
  obj: { [key: string]: any },
  f: (x: any) => boolean,
): T[] {
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
}

export function withDefault<T>(fallback: T): (value: T | undefined) => T {
  return (value) => {
    if (value === undefined) return fallback;
    return value;
  };
}
