import { allow, shield } from 'graphql-shield';

import { isAuthenticated } from './rules/is-authenticated';

export const permissions = shield({
  Query: {
    '*': isAuthenticated,
  },
  Mutation: {
    '*': isAuthenticated,
    login: allow,
    signup: allow,
  },
});
