import type { GraphQLSchema } from 'graphql';
import { applyMiddleware } from 'graphql-middleware';

import { guard } from '../src';

/**
 * The single place the tests apply guard to a schema, so changing how guard
 * is applied only changes this function.
 */
export const applyGuard = (
  schema: GraphQLSchema,
  ...args: Parameters<typeof guard>
): GraphQLSchema => applyMiddleware(schema, guard(...args));
