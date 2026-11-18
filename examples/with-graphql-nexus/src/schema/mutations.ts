import { arg } from 'nexus';
import { prismaObjectType } from 'nexus-prisma';

import { login, signup } from '../lib/resolvers/mutations';

export const Mutation = prismaObjectType({
  name: 'Mutation',
  definition(t) {
    t.field('signup', {
      args: t.prismaType.createUser.args,
      resolve: signup,
      type: 'User',
    });
    t.field('login', {
      args: {
        data: arg({
          type: 'LoginInput',
        }),
      },
      resolve: login,
      type: 'User',
    });
  },
});
