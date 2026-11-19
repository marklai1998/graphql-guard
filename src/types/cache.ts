import type { GraphQLResolveInfo } from 'graphql';
import type { GuardContext } from './context.js';
import type { RuleResult } from './rule.js';

export type Cache<TContext = GuardContext, TArgs = any, TParent = any> =
  | 'strict'
  | 'contextual'
  | 'no_cache'
  | CacheKeyFn<TContext, TArgs, TParent>;

export type CacheKeyFn<TContext = GuardContext, TArgs = any, TParent = any> = (
  parent: TParent,
  args: TArgs,
  ctx: TContext,
  info: GraphQLResolveInfo,
) => string | number;

export type CacheConstructorOptions<
  TContext = GuardContext,
  TArgs = any,
  TParent = any,
> = Cache<TContext, TArgs, TParent> | boolean;

export type HashFunction = (arg: { parent: any; args: any }) => string;

export type RuleCache = Map<string, RuleResult | Promise<RuleResult>>;
