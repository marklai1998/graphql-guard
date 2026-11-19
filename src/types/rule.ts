import type { GraphQLResolveInfo } from 'graphql';
import type { Cache, CacheConstructorOptions } from './cache.js';
import type { GuardContext } from './context.js';
import type { PopulatedOptions } from './options.js';

export type GuardRule = Rule | LogicRule;

export type Rule = {
  readonly name: string;

  equals(rule: Rule): boolean;
  resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult>;
};

export type RuleOptions = {
  cache: Cache;
};

export type LogicRule = {
  getRules(): GuardRule[];
  evaluate(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult[]>;
  resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult>;
};

export type RuleResult = boolean | string | Error;

export type RuleFunction<
  TContext = GuardContext,
  TArgs = any,
  TParent = any,
> = (
  parent: TParent,
  args: TArgs,
  ctx: TContext,
  info: GraphQLResolveInfo,
) => RuleResult | Promise<RuleResult>;

export type RuleConstructorOptions<
  TContext = GuardContext,
  TArgs = any,
  TParent = any,
> = {
  cache?: CacheConstructorOptions<TContext, TArgs, TParent>;
};
