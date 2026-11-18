import { inputObjectType } from 'nexus';

export const LoginInput = inputObjectType({
  name: 'LoginInput',
  definition(t) {
    t.field('email', {
      type: 'String',
    });
    t.field('password', {
      type: 'String',
    });
  },
});
