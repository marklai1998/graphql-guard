import type { GuardRule } from './rule.js';

export type RuleTypeMap = {
  [key: string]: GuardRule | RuleFieldMap;
};

export type RuleFieldMap = {
  [key: string]: GuardRule;
};

export type Rules = GuardRule | RuleTypeMap;
