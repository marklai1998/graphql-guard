import { prismaObjectType } from 'nexus-prisma';

import { me } from '../lib/resolvers/queries';

export const Query = prismaObjectType({
  name: 'Query',
  definition(t) {
    t.prismaFields(['*']);
    t.field('me', {
      nullable: true,
      resolve: me,
      type: 'User',
    });
  },
});
