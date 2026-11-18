import type { GraphQLSchema } from 'graphql';

import { guard } from '../src/index.js';

/**
 * The single place the tests apply guard to a schema, so changing how guard
 * is applied only changes this function.
 */
export const applyGuard = (
  schema: GraphQLSchema,
  ...args: Parameters<typeof guard> extends [unknown, ...infer Rest]
    ? Rest
    : never
): GraphQLSchema => guard(schema, ...args);
