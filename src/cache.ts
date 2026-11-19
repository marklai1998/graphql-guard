import type { GraphQLResolveInfo } from 'graphql';
import type { RuleCache } from './types/index.js';
import { isObject } from './utils/index.js';

// Used when the executor gives no per-run object, so the cache is per context.
const sharedRun = {};

// Used in place of a context that is not an object, such as a server that
// passes no context. The run key then keeps caches apart between requests.
const noContext = {};

type CacheNode = { cache?: RuleCache; children: WeakMap<object, CacheNode> };

const root: CacheNode = { children: new WeakMap() };

const child = (node: CacheNode, key: object): CacheNode => {
  let next = node.children.get(key);
  if (!next) {
    next = { children: new WeakMap() };
    node.children.set(key, next);
  }
  return next;
};

/**
 * Returns the rule cache for one run of an operation.
 *
 * The cache is keyed by the context and by `info.variableValues`. graphql-js
 * builds a new `variableValues` object every time it executes an operation, so
 * a server that reuses one context object for every request still gets a
 * fresh cache per request, and results never carry over between users.
 *
 * Without a context object the cache is keyed by the run alone, and without
 * either there is nothing that is unique to one request, so nothing is cached.
 *
 * Subscriptions are also keyed by `info.rootValue`, which is the event payload
 * for each event. graphql-js 17 reuses one `variableValues` object for every
 * event of a subscription, so without this the cache would keep results from
 * earlier events and grow for as long as the subscription stays open.
 */
export const getRuleCache = (
  ctx: unknown,
  info: GraphQLResolveInfo | undefined,
): RuleCache => {
  const hasContext = isObject(ctx);
  const hasRun = isObject(info?.variableValues);
  if (!hasContext && !hasRun) return new Map();

  const contextKey = hasContext ? ctx : noContext;
  const runKey = hasRun ? (info?.variableValues as object) : sharedRun;

  let node = child(child(root, contextKey), runKey);
  if (
    info?.operation?.operation === 'subscription' &&
    isObject(info.rootValue)
  ) {
    node = child(node, info.rootValue);
  }

  node.cache ??= new Map();
  return node.cache;
};
