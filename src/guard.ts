import { type IMiddlewareGenerator, middleware } from 'graphql-middleware';
import hash from 'object-hash';
import { allow } from './constructors.js';
import { generateMiddlewareGeneratorFromRuleTree } from './generator.js';
import type { Options, Rules } from './types.js';
import { ValidationError, validateRuleTree } from './validation.js';

export const defaultFallbackError = new Error('Not Authorised!');

export const guard = <TSource = any, TContext = any, TArgs = any>(
  ruleTree: Rules,
  options: Options = {},
): IMiddlewareGenerator<TSource, TContext, TArgs> => {
  const ruleTreeValidity = validateRuleTree(ruleTree);

  if (ruleTreeValidity.status === 'ok') {
    const generatorFunction = generateMiddlewareGeneratorFromRuleTree<
      TSource,
      TContext,
      TArgs
    >(ruleTree, {
      debug: options.debug ?? false,
      allowExternalErrors: options.allowExternalErrors ?? false,
      fallbackRule: options.fallbackRule ?? allow,
      fallbackError:
        typeof options.fallbackError === 'string'
          ? new Error(options.fallbackError)
          : (options.fallbackError ?? defaultFallbackError),
      hashFunction: options.hashFunction ?? hash,
    });

    return middleware(generatorFunction);
  } else {
    throw new ValidationError(ruleTreeValidity.message);
  }
};
