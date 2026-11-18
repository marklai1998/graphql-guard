import type { GraphQLResolveInfo } from 'graphql';
import type { IMiddlewareGenerator } from 'graphql-middleware';

// Rule

export type ShieldRule = Rule | LogicRule;

export type Rule = {
  readonly name: string;

  equals(rule: Rule): boolean;
  extractFragment(): Fragment | undefined;
  resolve(
    parent: object,
    args: object,
    ctx: ShieldContext,
    info: GraphQLResolveInfo,
    options: Options,
  ): Promise<RuleResult>;
};

export type RuleOptions = {
  cache: Cache;
  fragment?: Fragment;
};

export type LogicRule = {
  getRules(): ShieldRule[];
  extractFragments(): Fragment[];
  evaluate(
    parent: object,
    args: object,
    ctx: ShieldContext,
    info: GraphQLResolveInfo,
    options: Options,
  ): Promise<RuleResult[]>;
  resolve(
    parent: object,
    args: object,
    ctx: ShieldContext,
    info: GraphQLResolveInfo,
    options: Options,
  ): Promise<RuleResult>;
};

export type Fragment = string;
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
  fragment?: Fragment;
};

// Rules Definition Tree

export type RuleTypeMap = {
  [key: string]: ShieldRule | RuleFieldMap;
};

export type RuleFieldMap = {
  [key: string]: ShieldRule;
};

export type Rules = ShieldRule | RuleTypeMap;

export type HashFunction = (arg: { parent: any; args: any }) => string;

export type FallbackErrorMapperType = (
  err: unknown,
  parent: object,
  args: object,
  ctx: ShieldContext,
  info: GraphQLResolveInfo,
) => Promise<Error> | Error;

export type FallbackErrorType = Error | FallbackErrorMapperType;

// Generator Options

export type Options = {
  debug: boolean;
  allowExternalErrors: boolean;
  fallbackRule: ShieldRule;
  fallbackError?: FallbackErrorType;
  hashFunction: HashFunction;
};

export type OptionsConstructor = {
  debug?: boolean;
  allowExternalErrors?: boolean;
  fallbackRule?: ShieldRule;
  fallbackError?: string | FallbackErrorType;
  hashFunction?: HashFunction;
};

export declare function shield<TSource = any, TContext = any, TArgs = any>(
  ruleTree: Rules,
  options: Options,
): IMiddlewareGenerator<TSource, TContext, TArgs>;

export type ShieldContext = {
  _shield: {
    cache: { [key: string]: RuleResult | Promise<RuleResult> };
  };
};
