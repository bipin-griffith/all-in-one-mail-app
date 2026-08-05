import crypto from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: 'user' | 'admin';
  sid: string; // Session document id — lets any authenticated request identify "this device"
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  sid: string; // Session document id — scopes the token to one device/session
}

export function signRefreshToken(payload: RefreshTokenPayload): { token: string; expiresAt: Date } {
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);

  // Decode rather than re-parsing JWT_REFRESH_EXPIRES_IN ourselves, so the
  // stored expiry can never drift from what's actually encoded in the token.
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** Refresh tokens are stored hashed — never store the raw token server-side. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
