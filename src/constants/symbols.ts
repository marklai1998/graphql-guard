// The internal symbols below use Symbol.for, like the brands, so they are the
// same in every copy of graphql-guard (for example two packages in a monorepo
// that each install it). With Symbol(), a rule from the other copy would not see
// failClosed, and not() would invert its thrown error into an allow.

// Set while a rule runs inside not(). A rule that throws then rethrows instead
// of resolving to false, so not() can deny rather than invert the failure.
export const failClosed: unique symbol = Symbol.for(
  'graphql-guard/fail-closed/v1',
);

// Set by the guard for each field. A rule that throws and resolves to false
// reports the error here, so fallbackError receives it instead of null.
export const reportThrown: unique symbol = Symbol.for(
  'graphql-guard/report-thrown/v1',
);

// The internal, possibly synchronous version of `resolve` and `evaluate`.
// `resolve` and `evaluate` stay async for the public API.
export const resolveMaybeSync: unique symbol = Symbol.for(
  'graphql-guard/resolve-maybe-sync/v1',
);
export const evaluateMaybeSync: unique symbol = Symbol.for(
  'graphql-guard/evaluate-maybe-sync/v1',
);

// Anonymous rules get readable, sequential names. The counter lives on
// globalThis under this key so copies of graphql-guard loaded side by side
// (for example in a monorepo) never hand out the same name.
export const anonymousRuleCounterKey: unique symbol = Symbol.for(
  'graphql-guard/anonymous-rule-counter',
);
