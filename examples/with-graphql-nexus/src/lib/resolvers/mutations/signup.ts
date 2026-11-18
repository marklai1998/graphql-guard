import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { type Context, generateToken } from '../../context.js';

export async function signup(
  _parent: unknown,
  { data }: { data: { email: string; password: string; name: string } },
  ctx: Context,
) {
  if (await ctx.db.userByEmail(data.email)) {
    throw new GraphQLError(`User with email "${data.email}" already exists`);
  }

  const password = await bcrypt.hash(data.password, 10);
  const user = await ctx.db.createUser({ ...data, password });

  return { token: generateToken(user.id), user };
}
