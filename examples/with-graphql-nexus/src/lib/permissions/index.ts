import { allow, type Rules } from 'graphql-guard';
import { isAuthenticated } from './rules/is-authenticated.js';

export const permissions: Rules = {
  Query: {
    '*': isAuthenticated,
  },
  Mutation: {
    '*': isAuthenticated,
    login: allow,
    signup: allow,
  },
};
