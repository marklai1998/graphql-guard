import { objectType } from 'nexus';
import { me, users } from '../lib/resolvers/queries/index.js';

export const Query = objectType({
  name: 'Query',
  definition(t) {
    t.field('me', { type: 'User', resolve: me });
    t.nonNull.list.nonNull.field('users', { type: 'User', resolve: users });
  },
});
