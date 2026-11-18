import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { type Context, generateToken } from '../../context.js';

export async function login(
  _parent: unknown,
  { data: { email, password } }: { data: { email: string; password: string } },
  ctx: Context,
) {
  const user = await ctx.db.userByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new GraphQLError('Could not find a match for username and password');
  }

  return { token: generateToken(user.id), user };
}
