// Symbol.for keys are shared across copies of graphql-guard (for example its
// ESM and CommonJS builds loaded in one app), unlike `instanceof` checks.
export const ruleBrand: unique symbol = Symbol.for('graphql-guard/rule');
export const logicRuleBrand: unique symbol = Symbol.for(
  'graphql-guard/logic-rule',
);
