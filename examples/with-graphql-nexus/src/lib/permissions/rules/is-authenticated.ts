import { rule } from 'graphql-shield';

export const isAuthenticated = rule({ cache: 'contextual' })(
  (_parent, _args, ctx) => {
    return Boolean(ctx.request.userId);
  },
);
