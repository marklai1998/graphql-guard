import { or, rule } from 'graphql-guard';
import type { Context } from '../utils.js';

// Uncomment the console.log calls below to see how many times each rule runs.
// With `cache: 'contextual'`, each rule runs at most once per request.
// To see the effect with no cache, set { cache: false } in the isCustomer rule.

export const isGrocer = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx: Context) => {
    // console.log('GUARD: IsGrocer?');
    return ctx.email !== null && ctx.db.isGrocer(ctx.email);
  },
);

export const isCustomer = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx: Context) => {
    // console.log('GUARD: IsCustomer?');
    return ctx.email !== null && ctx.db.isCustomer(ctx.email);
  },
);

export const isAuthenticated = or(isCustomer, isGrocer);
