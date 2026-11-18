import type { GraphQLResolveInfo } from 'graphql';
import type { RuleResult } from './types.js';

export type RuleCache = Map<string, RuleResult | Promise<RuleResult>>;

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

// Used when the executor gives no per-run object, so the cache is per context.
const sharedRun = {};

const caches = new WeakMap<object, WeakMap<object, RuleCache>>();

/**
 * Returns the rule cache for one run of an operation.
 *
 * The cache is keyed by the context and by `info.variableValues`. graphql-js
 * builds a new `variableValues` object every time it executes an operation, so
 * a server that reuses one context object for every request still gets a
 * fresh cache per request, and results never carry over between users.
 */
export const getRuleCache = (
  ctx: unknown,
  info: GraphQLResolveInfo | undefined,
): RuleCache => {
  if (!isObject(ctx)) return new Map();

  const runKey = isObject(info?.variableValues)
    ? info.variableValues
    : sharedRun;

  let runs = caches.get(ctx);
  if (!runs) {
    runs = new WeakMap();
    caches.set(ctx, runs);
  }

  let cache = runs.get(runKey);
  if (!cache) {
    cache = new Map();
    runs.set(runKey, cache);
  }
  return cache;
};
