import type { Request, Response } from 'express';

import { env, isProduction } from '../../config/env';
import { HttpStatus } from '../../constants/httpStatus';
import { ApiError } from '../../utils/ApiError';
import { sendSuccess } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

import * as authService from './auth.service';
import type { LoginInput, RegisterInput } from './auth.validation';
import { buildGoogleConsentUrl } from './google.oauth';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/v1/auth',
  });
}

/** Captures the device/browser info stored on the Session document for that login. */
function getRequestContext(req: Pick<Request, 'headers' | 'ip'>): authService.RequestContext {
  return {
    userAgent: req.headers['user-agent'] ?? 'unknown',
    ip: req.ip ?? 'unknown',
  };
}

export const register = asyncHandler(async (req: Request<unknown, unknown, RegisterInput>, res) => {
  const { user, tokens } = await authService.register(req.body, getRequestContext(req));
  setRefreshCookie(res, tokens.refreshToken);
  sendSuccess(res, HttpStatus.CREATED, 'Account created', {
    user,
    accessToken: tokens.accessToken,
  });
});

export const login = asyncHandler(async (req: Request<unknown, unknown, LoginInput>, res) => {
  const { user, tokens } = await authService.login(req.body, getRequestContext(req));
  setRefreshCookie(res, tokens.refreshToken);
  sendSuccess(res, HttpStatus.OK, 'Logged in', { user, accessToken: tokens.accessToken });
});

export const redirectToGoogle = asyncHandler((_req: Request, res: Response) => {
  res.redirect(buildGoogleConsentUrl());
  return Promise.resolve();
});

export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = req.query.code;
  if (typeof code !== 'string') {
    throw ApiError.badRequest('Missing OAuth authorization code');
  }

  const { tokens } = await authService.loginWithGoogle(code, getRequestContext(req));
  setRefreshCookie(res, tokens.refreshToken);

  // SPA picks the access token up from the URL fragment (never logged/cached by servers,
  // unlike a query string) and stores it in memory, then calls GET /auth/me.
  res.redirect(`${env.CLIENT_URL}/oauth/callback#accessToken=${tokens.accessToken}`);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];
  if (!token) {
    throw ApiError.unauthorized('Missing refresh token');
  }

  const tokens = await authService.rotateSession(token);
  setRefreshCookie(res, tokens.refreshToken);
  sendSuccess(res, HttpStatus.OK, 'Token refreshed', { accessToken: tokens.accessToken });
});

/** Logs out this device only — see DELETE /auth/sessions for "log out everywhere else". */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await authService.logoutSession(req.user.sid);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  sendSuccess(res, HttpStatus.OK, 'Logged out', null);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getCurrentUser(req.user!.sub);
  sendSuccess(res, HttpStatus.OK, 'Current user', user);
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await authService.listSessions(req.user!.sub, req.user!.sid);
  sendSuccess(res, HttpStatus.OK, 'Active sessions', sessions);
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  await authService.revokeSession(req.user!.sub, req.params.id as string);
  sendSuccess(res, HttpStatus.OK, 'Session revoked', null);
});

export const revokeOtherSessions = asyncHandler(async (req: Request, res: Response) => {
  const count = await authService.revokeOtherSessions(req.user!.sub, req.user!.sid);
  sendSuccess(res, HttpStatus.OK, 'Other sessions revoked', { revokedCount: count });
});
