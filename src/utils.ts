import { RuleTrue } from './rules.js';
import type {
  GuardRule,
  LogicRule as LogicRuleType,
  Rule as RuleType,
} from './types.js';

const isObject = (x: unknown): x is Record<PropertyKey, unknown> =>
  typeof x === 'object' && x !== null;

// Rules are recognised by their API rather than by class or brand, so a rule
// from another copy of graphql-guard, or from any library with the same API
// (such as graphql-shield), is accepted.
export const isLogicRule = (x: unknown): x is LogicRuleType =>
  isObject(x) &&
  typeof x.resolve === 'function' &&
  typeof x.evaluate === 'function' &&
  typeof x.getRules === 'function';

export const isRule = (x: unknown): x is RuleType =>
  isObject(x) &&
  typeof x.resolve === 'function' &&
  typeof x.equals === 'function' &&
  typeof x.name === 'string' &&
  !isLogicRule(x);

// Only this copy's `allow` is recognised. Any other always-true rule still
// works; its fields are just wrapped like any other rule.
export const isAllowRule = (x: unknown): boolean => x instanceof RuleTrue;

export const isRuleFunction = (x: unknown): x is GuardRule => {
  return isRule(x) || isLogicRule(x);
};

export const flattenObjectOf = <T>(
  obj: { [key: string]: any },
  f: (x: any) => boolean,
): T[] => {
  const values = Object.keys(obj).reduce<T[]>((acc, key) => {
    const val = obj[key];
    if (f(val)) {
      return [...acc, val];
    } else if (val !== null && typeof val === 'object') {
      return [...acc, ...flattenObjectOf(val, f)];
    } else {
      return acc;
    }
  }, []);
  return values;
};
