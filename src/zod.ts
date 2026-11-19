import * as z from 'zod';
import { anonymousName } from './constructors.js';
import { createGuardError } from './errors.js';
import { Rule } from './rules.js';
import type { GuardContext, HashFunction, RuleFunction } from './types.js';

// inputRule lives in its own entry point, so only apps that import it need zod,
// both at runtime and for the type declarations.

export type InputRuleSchema<T, TContext = GuardContext> = (
  zod: typeof z,
  ctx: TContext,
) => z.ZodType<T>;

export type InputRuleOptions<T> = Parameters<z.ZodType<T>['safeParseAsync']>[1];

export class InputRule<T> extends Rule {
  constructor(
    name: string,
    schema: InputRuleSchema<T>,
    options?: InputRuleOptions<T>,
  ) {
    const validationFunction: RuleFunction = async (
      _parent: object,
      args: object,
      ctx: GuardContext,
    ) => {
      const result = await schema(z, ctx).safeParseAsync(args, options);
      if (result.success) return true;
      const error = createGuardError(
        result.error.issues[0]?.message ?? result.error.message,
        'BAD_USER_INPUT',
      );
      return Object.assign(error, { cause: result.error });
    };

    super(name, validationFunction, { cache: 'strict' });
  }

  // The schema only reads args, so the parent is left out of the cache key.
  // That also skips hashing the parent for every item of a list.
  protected override strictCacheInput(
    _parent: object,
    args: object,
  ): Parameters<HashFunction>[0] {
    return { parent: undefined, args };
  }
}

export const inputRule =
  <TContext = GuardContext>(name?: string) =>
  <T>(
    schema: InputRuleSchema<T, TContext>,
    options?: InputRuleOptions<T>,
  ): InputRule<T> =>
    new InputRule<T>(
      typeof name === 'string' ? name : anonymousName('input-rule'),
      schema,
      options,
    );
