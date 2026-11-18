import { type IMiddlewareGenerator, middleware } from 'graphql-middleware';
import hash from 'object-hash';
import { allow } from './constructors.js';
import { generateMiddlewareGeneratorFromRuleTree } from './generator.js';
import type {
  FallbackErrorType,
  GuardRule,
  HashFunction,
  Options,
  OptionsConstructor,
  Rules,
} from './types.js';
import { withDefault } from './utils.js';
import { ValidationError, validateRuleTree } from './validation.js';

const normalizeOptions = (options: OptionsConstructor): Options => {
  if (typeof options.fallbackError === 'string') {
    options.fallbackError = new Error(options.fallbackError);
  }

  return {
    debug: options.debug !== undefined ? options.debug : false,
    allowExternalErrors: withDefault(false)(options.allowExternalErrors),
    fallbackRule: withDefault<GuardRule>(allow)(options.fallbackRule),
    fallbackError: withDefault<FallbackErrorType>(new Error('Not Authorised!'))(
      options.fallbackError,
    ),
    hashFunction: withDefault<HashFunction>(hash)(options.hashFunction),
  };
};

export const guard = <TSource = any, TContext = any, TArgs = any>(
  ruleTree: Rules,
  options: OptionsConstructor = {},
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
