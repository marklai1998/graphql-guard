import { type IMiddlewareGenerator, middleware } from 'graphql-middleware';
import hash from 'object-hash';
import { allow } from './constructors.js';
import { generateMiddlewareGeneratorFromRuleTree } from './generator.js';
import type { Options, PopulatedOptions, Rules } from './types.js';
import { ValidationError, validateRuleTree } from './validation.js';

const normalizeOptions = (options: Options): PopulatedOptions => {
  if (typeof options.fallbackError === 'string') {
    options.fallbackError = new Error(options.fallbackError);
  }

  return {
    debug: options.debug ?? false,
    allowExternalErrors: options.allowExternalErrors ?? false,
    fallbackRule: options.fallbackRule ?? allow,
    fallbackError: options.fallbackError ?? new Error('Not Authorised!'),
    hashFunction: options.hashFunction ?? hash,
  };
};

export const guard = <TSource = any, TContext = any, TArgs = any>(
  ruleTree: Rules,
  options: Options = {},
): IMiddlewareGenerator<TSource, TContext, TArgs> => {
  const normalizedOptions = normalizeOptions(options);
  const ruleTreeValidity = validateRuleTree(ruleTree);

  if (ruleTreeValidity.status === 'ok') {
    const generatorFunction = generateMiddlewareGeneratorFromRuleTree<
      TSource,
      TContext,
      TArgs
    >(ruleTree, normalizedOptions);

    return middleware(generatorFunction);
  } else {
    throw new ValidationError(ruleTreeValidity.message);
  }
};
