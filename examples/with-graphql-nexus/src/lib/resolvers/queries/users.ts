import type { Context } from '../../context.js';

export function users(_parent: unknown, _args: unknown, ctx: Context) {
  return ctx.db.users();
}
