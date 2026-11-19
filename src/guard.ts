import type { GraphQLSchema } from 'graphql';
import { allow } from './constructors.js';
import { createGuardError, defaultFallbackError } from './errors.js';
import { applyRulesToSchema } from './generator.js';
import type { Options, Rules } from './types.js';
import { validateRuleTree } from './validation.js';

export { defaultFallbackError };

export const guard = (
  schema: GraphQLSchema,
  ruleTree: Rules,
  options: Options = {},
): GraphQLSchema => {
  validateRuleTree(ruleTree, options.fallbackRule);

  return applyRulesToSchema(schema, ruleTree, {
    debug: options.debug ?? false,
    suppressResolverError: options.suppressResolverError ?? false,
    fallbackRule: options.fallbackRule ?? allow,
    // `null` is kept: it resolves denied fields to null instead of an error.
    fallbackError:
      typeof options.fallbackError === 'string'
        ? createGuardError(options.fallbackError, 'FORBIDDEN')
        : options.fallbackError === undefined
          ? defaultFallbackError
          : options.fallbackError,
    hashFunction: options.hashFunction,
  });
};
