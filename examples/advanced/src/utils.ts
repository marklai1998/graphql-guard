import type { Db } from './db.js';

export type Context = {
  db: Db;
  email: string | null;
};

// For demonstration only: the bearer token is just the user's email.
export function getUserEmail(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  return authorization ? authorization.replace('Bearer ', '') : null;
}
