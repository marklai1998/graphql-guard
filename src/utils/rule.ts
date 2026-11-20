import { allowBrand, logicRuleBrand, ruleBrand } from '../constants/index.js';
import type {
  GuardRule,
  LogicRule as LogicRuleType,
  Rule as RuleType,
} from '../types/index.js';

export const isRule = (x: unknown): x is RuleType =>
  x !== null &&
  typeof x === 'object' &&
  ruleBrand in x &&
  x?.[ruleBrand] === true;

export const isLogicRule = (x: unknown): x is LogicRuleType =>
  x !== null &&
  typeof x === 'object' &&
  logicRuleBrand in x &&
  x?.[logicRuleBrand] === true;

export const isAllowRule = (x: unknown): boolean =>
  x !== null &&
  typeof x === 'object' &&
  allowBrand in x &&
  x?.[allowBrand] === true;

export const isRuleFunction = (x: unknown): x is GuardRule => {
  return isRule(x) || isLogicRule(x);
};
