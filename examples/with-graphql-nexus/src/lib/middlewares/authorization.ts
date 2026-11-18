import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthorizedRequest = Request & { userId?: string };

export function authorization() {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    const { token } = req.cookies;
    if (!token) {
      return next();
    }

    try {
      const { userId } = jwt.verify(
        token.replace('Bearer ', ''),
        process.env.APP_SECRET as string,
      ) as { userId: string };

      req.userId = userId;
    } catch (_error) {
      res.clearCookie('token');
    }

    return next();
  };
}
