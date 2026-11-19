import { anonymousRuleCounterKey } from './constants/index.js';
import { createGuardError, ValidationError } from './errors.js';
import {
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
} from './types/index.js';

const globalCounter = globalThis as { [anonymousRuleCounterKey]?: number };

export const anonymousName = (kind: string): string => {
  const n = (globalCounter[anonymousRuleCounterKey] ?? 0) + 1;
  globalCounter[anonymousRuleCounterKey] = n;
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
    } else {
      // rule(undefined, options) keeps its options, so a wrapper can pass an
      // optional name straight through.
      options = options || {};
      if (typeof name !== 'string') name = anonymousName('rule');
    }

    return new Rule(name, func as RuleFunction, {
      cache: options.cache as CacheConstructorOptions,
    });
  };

// An empty and() or chain() would resolve to true, so a field guarded by
// and(...rulesFromConfig) would silently become public when the list is empty.
// Empty or() and race() always deny, which is just as likely a mistake.
const assertNotEmpty = (name: string, rules: GuardRule[]): void => {
  if (rules.length === 0) {
    throw new ValidationError(
      `${name}() needs at least one rule. Use allow or deny if you meant to allow or deny everything.`,
    );
  }
};

export const and = (...rules: GuardRule[]): RuleAnd => {
  assertNotEmpty('and', rules);
  return new RuleAnd(rules);
};

export const chain = (...rules: GuardRule[]): RuleChain => {
  assertNotEmpty('chain', rules);
  return new RuleChain(rules);
};

export const race = (...rules: GuardRule[]): RuleRace => {
  assertNotEmpty('race', rules);
  return new RuleRace(rules);
};

export const or = (...rules: GuardRule[]): RuleOr => {
  assertNotEmpty('or', rules);
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
