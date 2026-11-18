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

export type Cache = 'strict' | 'contextual' | 'no_cache' | CacheKeyFn;
export type CacheKeyFn = (
  parent: any,
  args: any,
  ctx: any,
  info: GraphQLResolveInfo,
) => string;
export type RuleResult = boolean | string | Error;
export type RuleFunction = (
  parent: any,
  args: any,
  ctx: any,
  info: GraphQLResolveInfo,
) => RuleResult | Promise<RuleResult>;

// Rule Constructor Options

export type CacheConstructorOptions = Cache | boolean;

export type RuleConstructorOptions = {
  cache?: CacheConstructorOptions;
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
) => Promise<Error> | Error;

export type FallbackErrorType = Error | FallbackErrorMapperType;

// Generator Options

export type PopulatedOptions = {
  debug: boolean;
  allowExternalErrors: boolean;
  fallbackRule: GuardRule;
  fallbackError?: FallbackErrorType;
  hashFunction: HashFunction;
};

export type Options = {
  debug?: boolean;
  allowExternalErrors?: boolean;
  fallbackRule?: GuardRule;
  fallbackError?: string | FallbackErrorType;
  hashFunction?: HashFunction;
};

export type GuardContext = {
  _guard: {
    cache: { [key: string]: RuleResult | Promise<RuleResult> };
  };
};
