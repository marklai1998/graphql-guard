import type { Response } from 'express';
import jwt from 'jsonwebtoken';

export function generateToken(payload: { userId: string }) {
  return jwt.sign(payload, process.env.APP_SECRET as string);
}

export function setCookie(response: Response, token: string) {
  response.cookie('token', `Bearer ${token}`, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
  });
}
