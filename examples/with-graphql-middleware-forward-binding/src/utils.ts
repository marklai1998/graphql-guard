import type { Request } from 'express';
import type { Prisma } from './generated/prisma';

export interface Context {
  db: Prisma;
  request: Request;
}
