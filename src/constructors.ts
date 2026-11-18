import type * as z from 'zod';
import { createGuardError } from './errors.js';
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
  CacheConstructorOptions,
  GuardContext,
  GuardRule,
  RuleConstructorOptions,
  RuleFunction,
} from './types.js';

// Anonymous rules get readable, sequential names. The counter lives on
// globalThis under a Symbol.for key so copies of graphql-guard loaded side by
// side (for example its ESM and CommonJS builds) never hand out the same name.
const counterKey = Symbol.for('graphql-guard/anonymous-rule-counter');
const globalCounter = globalThis as { [counterKey]?: number };

const anonymousName = (kind: string): string => {
  const n = (globalCounter[counterKey] ?? 0) + 1;
  globalCounter[counterKey] = n;
  return `anonymous-${kind}-${n}`;
};

export const rule =
  <TContext = GuardContext, TArgs = any, TParent = any>(
    name?: string | RuleConstructorOptions<TContext, TArgs, TParent>,
    options?: RuleConstructorOptions<TContext, TArgs, TParent>,
  ) =>
  (func: RuleFunction<TContext, TArgs, TParent>): Rule => {
    if (typeof name === 'object') {
      options = name;
      name = anonymousName('rule');
    } else if (typeof name === 'string') {
      options = options || {};
    } else {
      name = anonymousName('rule');
      options = {};
    }

    return new Rule(name, func as RuleFunction, {
      cache: options.cache as CacheConstructorOptions,
    });
  };

export const inputRule =
  <TContext = GuardContext>(name?: string) =>
  <T>(
    schema: (zod: typeof z, ctx: TContext) => z.ZodType<T>,
    options?: Parameters<z.ZodType<T>['safeParseAsync']>[1],
  ): InputRule<T> =>
    new InputRule<T>(
      typeof name === 'string' ? name : anonymousName('input-rule'),
      schema,
      options,
    );

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
  if (typeof error === 'string') {
    return new RuleNot(rule, createGuardError(error, 'FORBIDDEN'));
  }
  return new RuleNot(rule, error);
};

export const allow = new RuleTrue();

export const deny = new RuleFalse();
