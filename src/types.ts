import type { GraphQLResolveInfo } from 'graphql';

// Rule

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
) => string;
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

// Rule Constructor Options

export type CacheConstructorOptions<
  TContext = GuardContext,
  TArgs = any,
  TParent = any,
> = Cache<TContext, TArgs, TParent> | boolean;

export type RuleConstructorOptions<
  TContext = GuardContext,
  TArgs = any,
  TParent = any,
> = {
  cache?: CacheConstructorOptions<TContext, TArgs, TParent>;
};

// Rules Definition Tree

export type RuleTypeMap = {
  [key: string]: GuardRule | RuleFieldMap;
};

export type RuleFieldMap = {
  [key: string]: GuardRule;
};

export type Rules = GuardRule | RuleTypeMap;

export type HashFunction = (arg: { parent: any; args: any }) => string;

export type FallbackErrorMapperType = (
  err: unknown,
  parent: object,
  args: object,
  ctx: GuardContext,
  info: GraphQLResolveInfo,
) => Promise<Error | null> | Error | null;

export type FallbackErrorType = Error | null | FallbackErrorMapperType;

// Generator Options

export type PopulatedOptions = {
  debug: boolean;
  suppressResolverError: boolean;
  fallbackRule: GuardRule;
  fallbackError?: FallbackErrorType;
  hashFunction: HashFunction;
};

export type Options = {
  debug?: boolean;
  suppressResolverError?: boolean;
  fallbackRule?: GuardRule;
  fallbackError?: string | FallbackErrorType;
  hashFunction?: HashFunction;
};

export type GuardContext = any;
