import type { GraphQLResolveInfo } from 'graphql';
import hash from 'object-hash';
import { allowBrand, logicRuleBrand, ruleBrand } from './brand.js';
import { getRuleCache } from './cache.js';
import { createGuardError } from './errors.js';
import type {
  Cache,
  CacheConstructorOptions,
  GuardContext,
  GuardRule,
  LogicRule as LogicRuleType,
  PopulatedOptions,
  RuleConstructorOptions,
  RuleFunction,
  RuleOptions,
  RuleResult,
  Rule as RuleType,
} from './types.js';

// The internal symbols below use Symbol.for, like the brands, so they are the
// same in every copy of graphql-guard (for example two packages in a monorepo
// that each install it). With Symbol(), a rule from the other copy would not see
// failClosed, and not() would invert its thrown error into an allow.

// Set while a rule runs inside not(). A rule that throws then rethrows instead
// of resolving to false, so not() can deny rather than invert the failure.
const failClosed = Symbol.for('graphql-guard/fail-closed/v1');

// Set by the guard for each field. A rule that throws and resolves to false
// reports the error here, so fallbackError receives it instead of null.
export const reportThrown = Symbol.for('graphql-guard/report-thrown/v1');

export type ResolveOptions = PopulatedOptions & {
  [failClosed]?: true;
  [reportThrown]?: (err: unknown) => void;
};

export type MaybePromise<T> = T | Promise<T>;

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

// Runs `f` on the value, and only waits when the value is a promise, so rules
// that answer synchronously never create a promise.
const then = <T, U>(
  value: MaybePromise<T>,
  f: (value: T) => MaybePromise<U>,
): MaybePromise<U> =>
  isPromiseLike(value) ? Promise.resolve(value).then(f) : f(value);

// Like Promise.all, but stays synchronous when every value is. Every task runs
// even if one throws, as with Promise.all over async functions.
const all = <T>(tasks: (() => MaybePromise<T>)[]): MaybePromise<T[]> => {
  const results: MaybePromise<T>[] = [];
  let async = false;
  for (const task of tasks) {
    try {
      const res = task();
      if (isPromiseLike(res)) async = true;
      results.push(res);
    } catch (err) {
      async = true;
      results.push(Promise.reject(err));
    }
  }
  return async ? Promise.all(results) : (results as T[]);
};

// The internal, possibly synchronous version of `resolve` and `evaluate`.
// `resolve` and `evaluate` stay async for the public API.
const resolveMaybeSync = Symbol.for('graphql-guard/resolve-maybe-sync/v1');
const evaluateMaybeSync = Symbol.for('graphql-guard/evaluate-maybe-sync/v1');

type MaybeSyncRule = {
  [resolveMaybeSync]?: (
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ) => MaybePromise<RuleResult>;
};

/**
 * Resolves a rule, synchronously when it can. A rule from another copy of
 * graphql-guard has no synchronous path and falls back to `resolve`.
 */
export const resolveRule = (
  rule: GuardRule,
  parent: object,
  args: object,
  ctx: GuardContext,
  info: GraphQLResolveInfo,
  options: PopulatedOptions,
): MaybePromise<RuleResult> => {
  const resolve = (rule as MaybeSyncRule)[resolveMaybeSync];
  return resolve
    ? resolve.call(rule, parent, args, ctx, info, options)
    : rule.resolve(parent, args, ctx, info, options);
};

// An empty string has no message to show, so it denies like false and gets
// fallbackError instead of an empty FORBIDDEN error.
const normalizeResult = (res: string | boolean | Error): RuleResult => {
  if (res instanceof Error) {
    return res;
  } else if (typeof res === 'string' && res !== '') {
    return createGuardError(res, 'FORBIDDEN');
  } else if (res === true) {
    return true;
  } else {
    return false;
  }
};

// Gives each parent object a number for the life of the object, so the strict
// cache tells parents apart by identity rather than by value.
const parentIds = new WeakMap<object, number>();
let nextParentId = 0;

const parentId = (parent: object): number => {
  let id = parentIds.get(parent);
  if (id === undefined) {
    id = nextParentId++;
    parentIds.set(parent, id);
  }
  return id;
};

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/**
 * The key for the `strict` cache. By default the parent is keyed by identity
 * and only `args` are hashed: hashing the parent by value can give two
 * different parents the same key when they differ only in data the hash can't
 * see (#private fields, getters, non-enumerable properties), and one would get
 * the other's answer. A custom hashFunction still receives `{ parent, args }`.
 */
const strictCacheKey = (
  parent: unknown,
  args: unknown,
  options: PopulatedOptions,
): string => {
  if (options.hashFunction) return options.hashFunction({ parent, args });
  return JSON.stringify([
    isObject(parent) ? parentId(parent) : hash({ parent }),
    hash({ args }),
  ]);
};

/**
 * Checks a key returned by a cache key function. Only strings and numbers are
 * accepted: anything else would go through String(), which turns every object
 * into "[object Object]" and gives every call the same key. Throwing here makes
 * the rule run uncached instead.
 */
const toCacheKey = (key: unknown): string => {
  if (typeof key === 'string') return key;
  if (typeof key === 'number') return String(key);
  throw new TypeError(
    `A cache key function must return a string or a number, got ${key === null ? 'null' : typeof key}.`,
  );
};

const firstError = (results: RuleResult[]): RuleResult =>
  results.find((res) => res instanceof Error) || false;

export class Rule implements RuleType {
  get [ruleBrand](): true {
    return true;
  }

  readonly name: string;

  private cache: Cache;
  private func: RuleFunction;

  constructor(
    name: string,
    func: RuleFunction,
    constructorOptions: RuleConstructorOptions,
  ) {
    const options = this.normalizeOptions(constructorOptions);

    this.name = name;
    this.func = func;
    this.cache = options.cache;
  }

  async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    return this[resolveMaybeSync](parent, args, ctx, info, options);
  }

  [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    const onError = (err: unknown): RuleResult => {
      if (options.debug || (options as ResolveOptions)[failClosed]) {
        throw err;
      }
      (options as ResolveOptions)[reportThrown]?.(err);
      return false;
    };

    try {
      const res = this.executeRule(parent, args, ctx, info, options);
      return isPromiseLike(res)
        ? Promise.resolve(res).then(normalizeResult, onError)
        : normalizeResult(res);
    } catch (err) {
      return onError(err);
    }
  }

  equals(rule: Rule): boolean {
    return this.func === rule.func;
  }

  private normalizeOptions(options: RuleConstructorOptions): RuleOptions {
    return {
      cache:
        options.cache !== undefined
          ? this.normalizeCacheOption(options.cache)
          : 'no_cache',
    };
  }

  private normalizeCacheOption(cache: CacheConstructorOptions): Cache {
    switch (cache) {
      case true: {
        return 'strict';
      }
      case false: {
        return 'no_cache';
      }
      default: {
        return cache;
      }
    }
  }

  private executeRule(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): string | boolean | Error | Promise<RuleResult> {
    switch (typeof this.cache) {
      case 'function': {
        /* User defined cache function. */
        const cacheKeyFn = this.cache;
        return this.withCacheKey(
          () => toCacheKey(cacheKeyFn(parent, args, ctx, info)),
          parent,
          args,
          ctx,
          info,
        );
      }
      case 'string': {
        /* Standard cache option. */
        switch (this.cache) {
          case 'strict': {
            return this.withCacheKey(
              () => strictCacheKey(parent, args, options),
              parent,
              args,
              ctx,
              info,
            );
          }
          case 'contextual': {
            return this.writeToCache()(parent, args, ctx, info);
          }
          case 'no_cache': {
            return this.func(parent, args, ctx, info);
          }
          /* istanbul ignore next */
          default: {
            throw new Error(`Unsupported cache format: ${typeof this.cache}`);
          }
        }
      }
      /* istanbul ignore next */
      default: {
        throw new Error(`Unsupported cache format: ${typeof this.cache}`);
      }
    }
  }

  /**
   * Runs the rule through the cache under the key from `getKey`. If the key
   * can't be computed (for example, object-hash throws on a parent holding a
   * Promise or a WeakMap), the rule runs uncached instead of being denied.
   */
  private withCacheKey(
    getKey: () => string,
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
  ): string | boolean | Error | Promise<RuleResult> {
    let key: string;
    try {
      key = getKey();
    } catch {
      return this.func(parent, args, ctx, info);
    }
    return this.writeToCache(key)(parent, args, ctx, info);
  }

  /**
   * Caches the rule result under the rule name and an optional key. The pair is
   * encoded as a JSON array so that no name and key combination can collide
   * with another, e.g. rule `a-b` (contextual) and rule `a` with key `b`.
   */
  private writeToCache(
    key?: string,
  ): (
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
  ) => string | boolean | Error | Promise<RuleResult> {
    return (parent, args, ctx, info) => {
      const cache = getRuleCache(ctx, info);
      const cacheKey = JSON.stringify(
        key === undefined ? [this.name] : [this.name, key],
      );
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, this.func(parent, args, ctx, info));
      }
      return cache.get(cacheKey) as RuleResult | Promise<RuleResult>;
    };
  }
}

export class LogicRule implements LogicRuleType {
  get [logicRuleBrand](): true {
    return true;
  }

  private rules: GuardRule[];

  constructor(rules: GuardRule[]) {
    this.rules = rules;
  }

  async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    return this[resolveMaybeSync](parent, args, ctx, info, options);
  }

  [resolveMaybeSync](
    _parent: object,
    _args: object,
    _ctx: GuardContext,
    _info: GraphQLResolveInfo,
    _options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    return false;
  }

  async evaluate(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult[]> {
    return this[evaluateMaybeSync](parent, args, ctx, info, options);
  }

  [evaluateMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult[]> {
    return all(
      this.getRules().map(
        (rule) => () => resolveRule(rule, parent, args, ctx, info, options),
      ),
    );
  }

  getRules() {
    return this.rules;
  }
}

// Extended Types

export class RuleOr extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    return then(
      this[evaluateMaybeSync](parent, args, ctx, info, options),
      (result) =>
        result.every((res) => res !== true) ? firstError(result) : true,
    );
  }
}

// and() and chain() reject an empty rule list; deny here too in case an empty
// one is built from the class directly.
const allTrue = (result: RuleResult[]): RuleResult => {
  if (result.length === 0) return false;
  return result.some((res) => res !== true) ? firstError(result) : true;
};

export class RuleAnd extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    return then(
      this[evaluateMaybeSync](parent, args, ctx, info, options),
      allTrue,
    );
  }
}

export class RuleChain extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    return then(
      this[evaluateMaybeSync](parent, args, ctx, info, options),
      allTrue,
    );
  }

  override [evaluateMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult[]> {
    const rules = this.getRules();

    // Stops at the first rule that isn't true.
    const iterate = (i: number): MaybePromise<RuleResult[]> => {
      const rule = rules[i];
      if (rule === undefined) return [];
      return then(resolveRule(rule, parent, args, ctx, info, options), (res) =>
        res !== true ? [res] : then(iterate(i + 1), (ress) => [res, ...ress]),
      );
    };

    return iterate(0);
  }
}

export class RuleRace extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    return then(
      this[evaluateMaybeSync](parent, args, ctx, info, options),
      (result) =>
        result.some((res) => res === true) ? true : firstError(result),
    );
  }

  override [evaluateMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult[]> {
    const rules = this.getRules();

    // Stops at the first rule that is true.
    const iterate = (i: number): MaybePromise<RuleResult[]> => {
      const rule = rules[i];
      if (rule === undefined) return [];
      return then(resolveRule(rule, parent, args, ctx, info, options), (res) =>
        res === true ? [res] : then(iterate(i + 1), (ress) => [res, ...ress]),
      );
    };

    return iterate(0);
  }
}

export class RuleNot extends LogicRule {
  error?: Error;

  constructor(rule: GuardRule, error?: Error) {
    super([rule]);
    this.error = error;
  }

  override [resolveMaybeSync](
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): MaybePromise<RuleResult> {
    // The wrapped rule threw (for example, its database is down). Inverting
    // that would let every request through, so deny instead. Inside another
    // not(), rethrow so the outermost not() denies.
    const onError = (err: unknown): RuleResult => {
      if (options.debug || (options as ResolveOptions)[failClosed]) throw err;
      (options as ResolveOptions)[reportThrown]?.(err);
      return false;
    };

    // A returned error or string is a deliberate "no", so it inverts to "yes".
    const invert = ([res]: RuleResult[]): RuleResult =>
      res !== true ? true : (this.error ?? false);

    try {
      const innerOptions: ResolveOptions = { ...options, [failClosed]: true };
      const result = this[evaluateMaybeSync](
        parent,
        args,
        ctx,
        info,
        innerOptions,
      );
      return isPromiseLike(result)
        ? Promise.resolve(result).then(invert, onError)
        : invert(result);
    } catch (err) {
      return onError(err);
    }
  }
}

export class RuleTrue extends LogicRule {
  get [allowBrand](): true {
    return true;
  }

  constructor() {
    super([]);
  }

  override [resolveMaybeSync](): MaybePromise<RuleResult> {
    return true;
  }
}

export class RuleFalse extends LogicRule {
  constructor() {
    super([]);
  }

  override [resolveMaybeSync](): MaybePromise<RuleResult> {
    return false;
  }
}
