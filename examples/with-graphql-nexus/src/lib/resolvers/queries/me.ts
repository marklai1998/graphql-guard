import type { Context } from '../../context.js';

export async function me(_parent: unknown, _args: unknown, ctx: Context) {
  return (await ctx.db.userById(ctx.userId ?? '')) ?? null;
}
