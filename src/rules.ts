import type { GraphQLResolveInfo } from 'graphql';
import * as Yup from 'yup';
import type {
  ICache,
  ICacheContructorOptions,
  IFragment,
  ILogicRule,
  IOptions,
  IRule,
  IRuleConstructorOptions,
  IRuleFunction,
  IRuleOptions,
  IRuleResult,
  IShieldContext,
  ShieldRule,
} from './types.js';
import { isLogicRule } from './utils.js';

export class Rule implements IRule {
  readonly name: string;

  private cache: ICache;
  private fragment?: IFragment;
  private func: IRuleFunction;

  constructor(
    name: string,
    func: IRuleFunction,
    constructorOptions: IRuleConstructorOptions,
  ) {
    const options = this.normalizeOptions(constructorOptions);

    this.name = name;
    this.func = func;
    this.cache = options.cache;
    this.fragment = options.fragment;
  }

  async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
    try {
      /* Resolve */
      const res = await this.executeRule(parent, args, ctx, info, options);

      if (res instanceof Error) {
        return res;
      } else if (typeof res === 'string') {
        return new Error(res);
      } else if (res === true) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      if (options.debug) {
        throw err;
      } else {
        return false;
      }
    }
  }

  equals(rule: Rule): boolean {
    return this.func === rule.func;
  }

  extractFragment(): IFragment | undefined {
    return this.fragment;
  }

  private normalizeOptions(options: IRuleConstructorOptions): IRuleOptions {
    return {
      cache:
        options.cache !== undefined
          ? this.normalizeCacheOption(options.cache)
          : 'no_cache',
      fragment: options.fragment !== undefined ? options.fragment : undefined,
    };
  }

  private normalizeCacheOption(cache: ICacheContructorOptions): ICache {
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
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): string | boolean | Error | Promise<IRuleResult> {
    switch (typeof this.cache) {
      case 'function': {
        /* User defined cache function. */
        const key = `${this.name}-${this.cache(parent, args, ctx, info)}`;
        return this.writeToCache(key)(parent, args, ctx, info);
      }
      case 'string': {
        /* Standard cache option. */
        switch (this.cache) {
          case 'strict': {
            const key = options.hashFunction({ parent, args });

            return this.writeToCache(`${this.name}-${key}`)(
              parent,
              args,
              ctx,
              info,
            );
          }
          case 'contextual': {
            return this.writeToCache(this.name)(parent, args, ctx, info);
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

  private writeToCache(
    key: string,
  ): (
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
  ) => string | boolean | Error | Promise<IRuleResult> {
    return (parent, args, ctx, info) => {
      if (!ctx._shield.cache[key]) {
        ctx._shield.cache[key] = this.func(parent, args, ctx, info);
      }
      return ctx._shield.cache[key];
    };
  }
}

export class InputRule<T> extends Rule {
  constructor(
    name: string,
    schema: (yup: typeof Yup, ctx: IShieldContext) => Yup.BaseSchema<T>,
    options?: Parameters<Yup.BaseSchema<T>['validate']>[1],
  ) {
    const validationFunction: IRuleFunction = (
      _parent: object,
      args: object,
      ctx: IShieldContext,
    ) =>
      schema(Yup, ctx)
        .validate(args, options)
        .then(() => true)
        .catch((err) => err);

    super(name, validationFunction, { cache: 'strict', fragment: undefined });
  }
}

export class LogicRule implements ILogicRule {
  private rules: ShieldRule[];

  constructor(rules: ShieldRule[]) {
    this.rules = rules;
  }

  async resolve(
    _parent: object,
    _args: object,
    _ctx: IShieldContext,
    _info: GraphQLResolveInfo,
    _options: IOptions,
  ): Promise<IRuleResult> {
    return false;
  }

  async evaluate(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult[]> {
    const rules = this.getRules();
    const tasks = rules.map((rule) =>
      rule.resolve(parent, args, ctx, info, options),
    );

    return Promise.all(tasks);
  }

  getRules() {
    return this.rules;
  }

  extractFragments(): IFragment[] {
    const fragments = this.rules.reduce<IFragment[]>((fragments, rule) => {
      if (isLogicRule(rule)) {
        return fragments.concat(...rule.extractFragments());
      }

      const fragment = rule.extractFragment();
      if (fragment) return fragments.concat(fragment);

      return fragments;
    }, []);

    return fragments;
  }
}

// Extended Types

export class RuleOr extends LogicRule {
  constructor(rules: ShieldRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
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
  constructor(rules: ShieldRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

    if (result.some((res) => res !== true)) {
      const customError = result.find((res) => res instanceof Error);
      return customError || false;
    } else {
      return true;
    }
  }
}

export class RuleChain extends LogicRule {
  constructor(rules: ShieldRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
    const result = await this.evaluate(parent, args, ctx, info, options);

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
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult[]> {
    const rules = this.getRules();

    return iterate(rules);

    async function iterate([rule, ...otherRules]: ShieldRule[]): Promise<
      IRuleResult[]
    > {
      if (rule === undefined) return [];
      return rule.resolve(parent, args, ctx, info, options).then((res) => {
        if (res !== true) {
          return [res];
        } else {
          return iterate(otherRules).then((ress) => ress.concat(res));
        }
      });
    }
  }
}

export class RuleRace extends LogicRule {
  constructor(rules: ShieldRule[]) {
    super(rules);
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
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
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult[]> {
    const rules = this.getRules();

    return iterate(rules);

    async function iterate([rule, ...otherRules]: ShieldRule[]): Promise<
      IRuleResult[]
    > {
      if (rule === undefined) return [];
      return rule.resolve(parent, args, ctx, info, options).then((res) => {
        if (res === true) {
          return [res];
        } else {
          return iterate(otherRules).then((ress) => ress.concat(res));
        }
      });
    }
  }
}

export class RuleNot extends LogicRule {
  error?: Error;

  constructor(rule: ShieldRule, error?: Error) {
    super([rule]);
    this.error = error;
  }

  override async resolve(
    parent: object,
    args: object,
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
    options: IOptions,
  ): Promise<IRuleResult> {
    const [res] = await this.evaluate(parent, args, ctx, info, options);

    if (res instanceof Error) {
      return true;
    } else if (res !== true) {
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

  override async resolve(): Promise<IRuleResult> {
    return true;
  }
}

export class RuleFalse extends LogicRule {
  constructor() {
    super([]);
  }

  override async resolve(): Promise<IRuleResult> {
    return false;
  }
}
