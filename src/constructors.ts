import type * as Yup from 'yup';
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
  RuleConstructorOptions,
  RuleFunction,
  ShieldContext,
  ShieldRule,
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
    schema: (yup: typeof Yup, ctx: ShieldContext) => Yup.BaseSchema<T>,
    options?: Parameters<Yup.BaseSchema<T>['validate']>[1],
  ) => {
    if (typeof name === 'string') {
      return new InputRule(name, schema, options);
    } else {
      return new InputRule(Math.random().toString(), schema, options);
    }
  };

export const and = (...rules: ShieldRule[]): RuleAnd => {
  return new RuleAnd(rules);
};

export const chain = (...rules: ShieldRule[]): RuleChain => {
  return new RuleChain(rules);
};

export const race = (...rules: ShieldRule[]): RuleRace => {
  return new RuleRace(rules);
};

export const or = (...rules: ShieldRule[]): RuleOr => {
  return new RuleOr(rules);
};

export const not = (rule: ShieldRule, error?: string | Error): RuleNot => {
  if (typeof error === 'string') return new RuleNot(rule, new Error(error));
  return new RuleNot(rule, error);
};

export const allow = new RuleTrue();

export const deny = new RuleFalse();
