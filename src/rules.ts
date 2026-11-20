import type { GraphQLResolveInfo } from 'graphql';
import hash from 'object-hash';
import { getRuleCache } from './cache.js';
import {
  allowBrand,
  evaluateMaybeSync,
  failClosed,
  logicRuleBrand,
  reportThrown,
  resolveMaybeSync,
  ruleBrand,
} from './constants/index.js';
import { createGuardError } from './errors.js';
import type {
  CacheConstructorOptions,
  GuardContext,
  GuardRule,
  LogicRule as LogicRuleType,
  MaybePromise,
  PopulatedOptions,
  ResolveOptions,
  RuleConstructorOptions,
  RuleFunction,
  RuleResult,
  Rule as RuleType,
} from './types/index.js';
import {
  allMaybeSync,
  andThen,
  isObject,
  isPlainObject,
  isPromiseLike,
} from './utils/index.js';

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
    isObject(parent) ? parentId(parent) : primitiveKey(parent),
    hasNoArgs(args) ? '' : hash({ args }),
  ]);
};

// Most fields take no arguments, and graphql-js passes an empty object for
// them. Hashing it with object-hash costs as much as a cheap rule, so it gets
// a fixed key instead. '' can't collide with a hash, which is never empty.
const hasNoArgs = (args: unknown): boolean => {
  if (!isPlainObject(args)) return false;
  for (const _ in args) return false;
  return Object.getOwnPropertySymbols(args).length === 0;
};

// The root value is usually undefined, which needs no hashing either.
const primitiveKey = (parent: unknown): string =>
  parent === undefined ? 'u' : parent === null ? 'n' : hash({ parent });

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

// A rule that throws denies, unless debug mode or an enclosing not() asks for
// the error to be rethrown.
const handleRuleError = (
  err: unknown,
  options: PopulatedOptions,
): RuleResult => {
  if (options.debug || (options as ResolveOptions)[failClosed]) throw err;
  (options as ResolveOptions)[reportThrown]?.(err);
  return false;
};

type RuleExecutorResult = string | boolean | Error | Promise<RuleResult>;

type RuleExecutor = (
  parent: object,
  args: object,
  ctx: GuardContext,
  info: GraphQLResolveInfo,
  options: PopulatedOptions,
) => RuleExecutorResult;

const firstError = (results: RuleResult[]): RuleResult =>
  results.find((res) => res instanceof Error) || false;

export class Rule implements RuleType {
  get [ruleBrand](): true {
    return true;
  }

  readonly name: string;

  readonly #func: RuleFunction;
  readonly #executeRule: RuleExecutor;

  constructor(
    name: string,
    func: RuleFunction,
    options: RuleConstructorOptions,
  ) {
    this.name = name;
    this.#func = func;
    this.#executeRule = this.#createExecutor(options.cache);
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
    try {
      const res = this.#executeRule(parent, args, ctx, info, options);
      return isPromiseLike(res)
        ? Promise.resolve(res).then(normalizeResult, (err) =>
            handleRuleError(err, options),
          )
        : normalizeResult(res);
    } catch (err) {
      return handleRuleError(err, options);
    }
  }

  equals(rule: RuleType): boolean {
    // A rule from another copy of graphql-guard has no #func to compare.
    return #func in rule && this.#func === rule.#func;
  }

  /**
   * Picks how the rule runs for its cache option, once, so each call is a
   * plain function call with no option checks.
   */
  #createExecutor(cache: CacheConstructorOptions | undefined): RuleExecutor {
    const func = this.#func;

    if (typeof cache === 'function') {
      /* User defined cache function. */
      return this.#withCacheKey((parent, args, ctx, info) =>
        toCacheKey(cache(parent, args, ctx, info)),
      );
    }

    switch (cache) {
      case true:
      case 'strict': {
        return this.#withCacheKey((parent, args, _ctx, _info, options) =>
          strictCacheKey(parent, args, options),
        );
      }
      case 'contextual': {
        const cacheKey = JSON.stringify([this.name]);
        return (parent, args, ctx, info) =>
          this.#readThroughCache(cacheKey, parent, args, ctx, info);
      }
      case undefined:
      case false:
      case 'no_cache': {
        return (parent, args, ctx, info) => func(parent, args, ctx, info);
      }
      /* istanbul ignore next */
      default: {
        // Thrown when the rule runs, not here, so an unknown option denies
        // like any other rule error instead of failing at construction.
        return () => {
          throw new Error(`Unsupported cache format: ${typeof cache}`);
        };
      }
    }
  }

  /**
   * Runs the rule through the cache under the key from `getKey`. If the key
   * can't be computed (for example, object-hash throws on a parent holding a
   * Promise or a WeakMap), the rule runs uncached instead of being denied.
   */
  #withCacheKey(
    getKey: (...params: Parameters<RuleExecutor>) => string,
  ): RuleExecutor {
    const func = this.#func;
    return (parent, args, ctx, info, options) => {
      let key: string;
      try {
        key = getKey(parent, args, ctx, info, options);
      } catch {
        return func(parent, args, ctx, info);
      }
      return this.#readThroughCache(
        JSON.stringify([this.name, key]),
        parent,
        args,
        ctx,
        info,
      );
    };
  }

  /**
   * Returns the cached result under `cacheKey`, running the rule on a miss. The
   * key is the rule name and an optional key encoded as a JSON array, so that
   * no name and key combination can collide with another, e.g. rule `a-b`
   * (contextual) and rule `a` with key `b`.
   */
  #readThroughCache(
    cacheKey: string,
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
  ): RuleExecutorResult {
    const cache = getRuleCache(ctx, info);
    let res = cache.get(cacheKey);
    if (res === undefined && !cache.has(cacheKey)) {
      res = this.#func(parent, args, ctx, info);
      cache.set(cacheKey, res);
    }
    return res as RuleExecutorResult;
  }
}

export class LogicRule implements LogicRuleType {
  get [logicRuleBrand](): true {
    return true;
  }

  readonly #rules: GuardRule[];

  constructor(rules: GuardRule[]) {
    this.#rules = rules;
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
    return allMaybeSync(
      this.getRules().map(
        (rule) => () => resolveRule(rule, parent, args, ctx, info, options),
      ),
    );
  }

  getRules(): GuardRule[] {
    return this.#rules;
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
    return andThen(
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
    return andThen(
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
    return andThen(
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
      return andThen(
        resolveRule(rule, parent, args, ctx, info, options),
        (res) =>
          res !== true
            ? [res]
            : andThen(iterate(i + 1), (ress) => [res, ...ress]),
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
    return andThen(
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
      return andThen(
        resolveRule(rule, parent, args, ctx, info, options),
        (res) =>
          res === true
            ? [res]
            : andThen(iterate(i + 1), (ress) => [res, ...ress]),
      );
    };

    return iterate(0);
  }
}

export class RuleNot extends LogicRule {
  readonly error?: Error;

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
    const onError = (err: unknown): RuleResult => handleRuleError(err, options);

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
