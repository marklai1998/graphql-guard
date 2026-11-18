import type { Prisma } from './generated/prisma';

export type Context = {
  db: Prisma;
  request: any;
};

export function getUserEmail(ctx: Context): string {
  const Authorization = ctx.request.get('Authorization');
  if (Authorization) {
    const email = Authorization.replace('Bearer ', '');
    return email;
  }
  return null;
}
