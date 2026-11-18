import type { Context } from '../utils.js';

export const Query = {
  // Return an empty object; the Viewer resolvers read the user from the context.
  viewer: () => ({}),
  products: (_parent: unknown, _args: unknown, ctx: Context) =>
    ctx.db.products(),
};
