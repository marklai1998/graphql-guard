import type { GraphQLResolveInfo } from 'graphql';
import type { failClosed, reportThrown } from '../constants/symbols.js';
import type { HashFunction } from './cache.js';
import type { GuardContext } from './context.js';
import type { GuardRule } from './rule.js';

export type FallbackErrorMapperType = (
  err: unknown,
  parent: object,
  args: object,
  ctx: GuardContext,
  info: GraphQLResolveInfo,
) => Promise<Error | null> | Error | null;

export type FallbackErrorType = Error | null | FallbackErrorMapperType;

export type Options = {
  debug?: boolean;
  suppressResolverError?: boolean;
  fallbackRule?: GuardRule;
  fallbackError?: string | FallbackErrorType;
  hashFunction?: HashFunction;
};

/**
 * The guard's options after defaults are applied. This is the last argument of
 * `Rule.resolve` and `LogicRule.resolve` / `evaluate`, for calling a rule
 * directly (for example in a test).
 */
export type PopulatedOptions = {
  debug: boolean;
  suppressResolverError: boolean;
  fallbackRule: GuardRule;
  fallbackError?: FallbackErrorType;
  // Unset means the default strict key: parent by identity, args by hash.
  hashFunction?: HashFunction;
};

// The options a rule receives while it resolves: the populated options plus
// the guard's internal hooks.
export type ResolveOptions = PopulatedOptions & {
  [failClosed]?: true;
  [reportThrown]?: (err: unknown) => void;
};
