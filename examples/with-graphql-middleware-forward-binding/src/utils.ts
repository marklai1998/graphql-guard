import type { Request } from 'express';
import type { Prisma } from './generated/prisma';

export type Context = {
  db: Prisma;
  request: Request;
};
