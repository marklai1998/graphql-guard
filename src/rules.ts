import type { GraphQLResolveInfo } from 'graphql';
import { logicRuleBrand, ruleBrand } from './brand.js';
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

// Set while a rule runs inside not(). A rule that throws then rethrows instead
// of resolving to false, so not() can deny rather than invert the failure.
const failClosed = Symbol('failClosed');

// Set by the guard for each field. A rule that throws and resolves to false
// reports the error here, so fallbackError receives it instead of null.
export const reportThrown = Symbol('reportThrown');

export type ResolveOptions = PopulatedOptions & {
  [failClosed]?: true;
  [reportThrown]?: (err: unknown) => void;
};

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
    try {
      /* Resolve */
      const res = await this.executeRule(parent, args, ctx, info, options);

      if (res instanceof Error) {
        return res;
      } else if (typeof res === 'string') {
        return createGuardError(res, 'FORBIDDEN');
      } else if (res === true) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      if (options.debug || (options as ResolveOptions)[failClosed]) {
        throw err;
      } else {
        (options as ResolveOptions)[reportThrown]?.(err);
        return false;
      }
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
          () => String(cacheKeyFn(parent, args, ctx, info)),
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
              () => options.hashFunction({ parent, args }),
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
    _parent: object,
    _args: object,
    _ctx: GuardContext,
    _info: GraphQLResolveInfo,
    _options: PopulatedOptions,
  ): Promise<RuleResult> {
    return false;
  }

  async evaluate(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult[]> {
    const rules = this.getRules();
    const tasks = rules.map((rule) =>
      rule.resolve(parent, args, ctx, info, options),
    );

    return Promise.all(tasks);
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

  override async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

    if (result.every((res) => res !== true)) {
      const customError = result.find((res) => res instanceof Error);
      return customError || false;
    } else {
      return true;
    }
  }
}

export class RuleAnd extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

    // and() and chain() reject an empty rule list; deny here too in case an
    // empty one is built from the class directly.
    if (result.length === 0) return false;
    if (result.some((res) => res !== true)) {
      const customError = result.find((res) => res instanceof Error);
      return customError || false;
    } else {
      return true;
    }
  }
}

export class RuleChain extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

    // and() and chain() reject an empty rule list; deny here too in case an
    // empty one is built from the class directly.
    if (result.length === 0) return false;
    if (result.some((res) => res !== true)) {
      const customError = result.find((res) => res instanceof Error);
      return customError || false;
    } else {
      return true;
    }
  }

  override async evaluate(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult[]> {
    const rules = this.getRules();

    const iterate = async ([rule, ...otherRules]: GuardRule[]): Promise<
      RuleResult[]
    > => {
      if (rule === undefined) return [];
      return rule.resolve(parent, args, ctx, info, options).then((res) => {
        if (res !== true) {
          return [res];
        } else {
          return iterate(otherRules).then((ress) => [res, ...ress]);
        }
      });
    };

    return iterate(rules);
  }
}

export class RuleRace extends LogicRule {
  constructor(rules: GuardRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

    if (result.some((res) => res === true)) {
      return true;
    } else {
      const customError = result.find((res) => res instanceof Error);
      return customError || false;
    }
  }

  override async evaluate(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult[]> {
    const rules = this.getRules();

    const iterate = async ([rule, ...otherRules]: GuardRule[]): Promise<
      RuleResult[]
    > => {
      if (rule === undefined) return [];
      return rule.resolve(parent, args, ctx, info, options).then((res) => {
        if (res === true) {
          return [res];
        } else {
          return iterate(otherRules).then((ress) => [res, ...ress]);
        }
      });
    };

    return iterate(rules);
  }
}

export class RuleNot extends LogicRule {
  error?: Error;

  constructor(rule: GuardRule, error?: Error) {
    super([rule]);
    this.error = error;
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: GuardContext,
    info: GraphQLResolveInfo,
    options: PopulatedOptions,
  ): Promise<RuleResult> {
    let res: RuleResult | undefined;
    try {
      const innerOptions: ResolveOptions = { ...options, [failClosed]: true };
      [res] = await this.evaluate(parent, args, ctx, info, innerOptions);
    } catch (err) {
      // The wrapped rule threw (for example, its database is down). Inverting
      // that would let every request through, so deny instead. Inside another
      // not(), rethrow so the outermost not() denies.
      if (options.debug || (options as ResolveOptions)[failClosed]) throw err;
      (options as ResolveOptions)[reportThrown]?.(err);
      return false;
    }

    // A returned error or string is a deliberate "no", so it inverts to "yes".
    if (res !== true) {
      return true;
    } else {
      if (this.error) return this.error;
      return false;
    }
  }
}

export class RuleTrue extends LogicRule {
  constructor() {
    super([]);
  }

  override async resolve(): Promise<RuleResult> {
    return true;
  }
}

export class RuleFalse extends LogicRule {
  constructor() {
    super([]);
  }

  override async resolve(): Promise<RuleResult> {
    return false;
  }
}
