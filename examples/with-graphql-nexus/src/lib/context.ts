import jwt from 'jsonwebtoken';
import type { Db } from './db.js';

export type Context = {
  db: Db;
  userId: string | null;
};

const appSecret = () => {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error('APP_SECRET is not set. Copy .env.example to .env.');
  }
  return secret;
};

export function generateToken(userId: string) {
  return jwt.sign({ userId }, appSecret(), { expiresIn: '1d' });
}

// Reads the user id from an `Authorization: Bearer <token>` header.
export function getUserId(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const { userId } = jwt.verify(
      authorization.replace('Bearer ', ''),
      appSecret(),
    ) as { userId: string };
    return userId;
  } catch {
    return null;
  }
}
