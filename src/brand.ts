// Symbol.for keys are shared across copies of graphql-guard (for example two
// packages in a monorepo that each install it), unlike `instanceof` checks.
export const ruleBrand: unique symbol = Symbol.for('graphql-guard/rule');
export const logicRuleBrand: unique symbol = Symbol.for(
  'graphql-guard/logic-rule',
);

// Marks `allow`, so the guard can skip wrapping fields that use the `allow` of
// any copy of graphql-guard.
export const allowBrand: unique symbol = Symbol.for('graphql-guard/allow');
