import { arg, nonNull, objectType } from 'nexus';
import { login, signup } from '../lib/resolvers/mutations/index.js';

export const Mutation = objectType({
  name: 'Mutation',
  definition(t) {
    t.nonNull.field('signup', {
      type: 'AuthPayload',
      args: { data: nonNull(arg({ type: 'SignupInput' })) },
      resolve: signup,
    });
    t.nonNull.field('login', {
      type: 'AuthPayload',
      args: { data: nonNull(arg({ type: 'LoginInput' })) },
      resolve: login,
    });
  },
});
