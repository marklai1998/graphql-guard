import { logicRuleBrand, ruleBrand } from './brand.js';
import type {
  GuardRule,
  LogicRule as LogicRuleType,
  Rule as RuleType,
} from './types.js';

export const isRule = (x: any): x is RuleType => x?.[ruleBrand] === true;

export const isLogicRule = (x: any): x is LogicRuleType =>
  x?.[logicRuleBrand] === true;

export const isRuleFunction = (x: any): x is GuardRule => {
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
