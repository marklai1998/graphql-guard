import type * as z from 'zod';
import {
  InputRule,
  Rule,
  RuleAnd,
  RuleChain,
  RuleFalse,
  RuleNot,
  RuleOr,
  RuleRace,
  RuleTrue,
} from './rules.js';
import type {
  GuardContext,
  GuardRule,
  RuleConstructorOptions,
  RuleFunction,
} from './types.js';

export const rule =
  (name?: string | RuleConstructorOptions, options?: RuleConstructorOptions) =>
  (func: RuleFunction): Rule => {
    if (typeof name === 'object') {
      options = name;
      name = Math.random().toString();
    } else if (typeof name === 'string') {
      options = options || {};
    } else {
      name = Math.random().toString();
      options = {};
    }

    return new Rule(name, func, {
      fragment: options.fragment,
      cache: options.cache,
    });
  };

export const inputRule =
  <T>(name?: string) =>
  (
    schema: (zod: typeof z, ctx: GuardContext) => z.ZodType<T>,
    options?: Parameters<z.ZodType<T>['safeParseAsync']>[1],
  ) => {
    if (typeof name === 'string') {
      return new InputRule(name, schema, options);
    } else {
      return new InputRule(Math.random().toString(), schema, options);
    }
  };

export const and = (...rules: GuardRule[]): RuleAnd => {
  return new RuleAnd(rules);
};

export const chain = (...rules: GuardRule[]): RuleChain => {
  return new RuleChain(rules);
};

export const race = (...rules: GuardRule[]): RuleRace => {
  return new RuleRace(rules);
};

export const or = (...rules: GuardRule[]): RuleOr => {
  return new RuleOr(rules);
};

export const not = (rule: GuardRule, error?: string | Error): RuleNot => {
  if (typeof error === 'string') return new RuleNot(rule, new Error(error));
  return new RuleNot(rule, error);
};

export const allow = new RuleTrue();

export const deny = new RuleFalse();
