import type { GraphQLResolveInfo } from 'graphql';
import type { IMiddlewareGenerator } from 'graphql-middleware';

// Rule

export type ShieldRule = IRule | ILogicRule;

export type IRule = {
  readonly name: string;

  equals(rule: IRule): boolean;
  extractFragment(): IFragment | undefined;
  resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult>;
};

export type IRuleOptions = {
  cache: ICache;
  fragment?: IFragment;
};

export type ILogicRule = {
  getRules(): ShieldRule[];
  extractFragments(): IFragment[];
  evaluate(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult[]>;
  resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult>;
};

export type IFragment = string;
export type ICache = 'strict' | 'contextual' | 'no_cache' | ICacheKeyFn;
export type ICacheKeyFn = (
  parent: any,
  args: any,
  ctx: any,
  info: GraphQLResolveInfo,
) => string;
export type IRuleResult = boolean | string | Error;
export type IRuleFunction = (
  parent: any,
  args: any,
  ctx: any,
  info: GraphQLResolveInfo,
) => IRuleResult | Promise<IRuleResult>;

// Rule Constructor Options

export type ICacheContructorOptions = ICache | boolean;

export type IRuleConstructorOptions = {
  cache?: ICacheContructorOptions;
  fragment?: IFragment;
};

// Rules Definition Tree

export type IRuleTypeMap = {
  [key: string]: ShieldRule | IRuleFieldMap;
};

export type IRuleFieldMap = {
  [key: string]: ShieldRule;
};

export type IRules = ShieldRule | IRuleTypeMap;

export type IHashFunction = (arg: { parent: any; args: any }) => string;

export type IFallbackErrorMapperType = (
  err: unknown,
  parent: object,
  args: object,
  ctx: IShieldContext,
  info: GraphQLResolveInfo,
) => Promise<Error> | Error;

export type IFallbackErrorType = Error | IFallbackErrorMapperType;

// Generator Options

export type IOptions = {
  debug: boolean;
  allowExternalErrors: boolean;
  fallbackRule: ShieldRule;
  fallbackError?: IFallbackErrorType;
  hashFunction: IHashFunction;
};

export type IOptionsConstructor = {
  debug?: boolean;
  allowExternalErrors?: boolean;
  fallbackRule?: ShieldRule;
  fallbackError?: string | IFallbackErrorType;
  hashFunction?: IHashFunction;
};

export declare function shield<TSource = any, TContext = any, TArgs = any>(
  ruleTree: IRules,
  options: IOptions,
): IMiddlewareGenerator<TSource, TContext, TArgs>;

export type IShieldContext = {
  _shield: {
    cache: { [key: string]: IRuleResult | Promise<IRuleResult> };
  };
};
