import type { Context } from '../utils.js';

// Viewer is only reachable through rules that require a customer,
// so the email is always set here.
export const Viewer = {
  email: (_parent: unknown, _args: unknown, ctx: Context) => ctx.email,
  basket: (_parent: unknown, _args: unknown, ctx: Context) =>
    ctx.db.basket(ctx.email as string),
};
