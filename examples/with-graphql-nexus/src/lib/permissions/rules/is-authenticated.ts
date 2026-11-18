import { rule } from 'graphql-guard';
import type { Context } from '../../context.js';

export const isAuthenticated = rule({ cache: 'contextual' })(
  (_parent, _args, ctx: Context) => ctx.userId !== null,
);
