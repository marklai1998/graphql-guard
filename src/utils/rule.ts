import { allowBrand, logicRuleBrand, ruleBrand } from '../constants/index.js';
import type {
  GuardRule,
  LogicRule as LogicRuleType,
  Rule as RuleType,
} from '../types/index.js';

export const isRule = (x: any): x is RuleType => x?.[ruleBrand] === true;

export const isLogicRule = (x: any): x is LogicRuleType =>
  x?.[logicRuleBrand] === true;

export const isAllowRule = (x: any): boolean => x?.[allowBrand] === true;

export const isRuleFunction = (x: any): x is GuardRule => {
  return isRule(x) || isLogicRule(x);
};
