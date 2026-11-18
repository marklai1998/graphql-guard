import type { GraphQLSchema } from 'graphql';
import hash from 'object-hash';
import { allow } from './constructors.js';
import { createGuardError } from './errors.js';
import { applyRulesToSchema } from './generator.js';
import type { Options, Rules } from './types.js';
import { validateRuleTree } from './validation.js';

export const defaultFallbackError = createGuardError(
  'Not Authorised!',
  'FORBIDDEN',
);

export const guard = (
  schema: GraphQLSchema,
  ruleTree: Rules,
  options: Options = {},
): GraphQLSchema => {
  validateRuleTree(ruleTree);

  return applyRulesToSchema(schema, ruleTree, {
    debug: options.debug ?? false,
    allowExternalErrors: options.allowExternalErrors ?? false,
    fallbackRule: options.fallbackRule ?? allow,
    fallbackError:
      typeof options.fallbackError === 'string'
        ? createGuardError(options.fallbackError, 'FORBIDDEN')
        : (options.fallbackError ?? defaultFallbackError),
    hashFunction: options.hashFunction ?? hash,
  });
};
