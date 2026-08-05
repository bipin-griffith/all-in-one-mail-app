import { EmailAccount } from '../../models/emailAccount.model';
import { Session, type SessionDocument } from '../../models/session.model';
import { User, type UserDocument } from '../../models/user.model';
import { ApiError } from '../../utils/ApiError';
import { encrypt } from '../../utils/crypto';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '../../utils/jwt';

import type { LoginInput, RegisterInput } from './auth.validation';
import { exchangeCodeForTokens } from './google.oauth';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Device/request metadata captured on a session, shown back to the user in "active sessions". */
export interface RequestContext {
  userAgent: string;
  ip: string;
}

function toAccessPayload(user: UserDocument, sessionId: string): AccessTokenPayload {
  return { sub: user.id as string, email: user.email, role: user.role, sid: sessionId };
}

/**
 * Creates a brand-new Session document (new device/login) and returns a
 * matching access + refresh token pair. Called on register/login/Google
 * login — every one of those is a *new* session, distinct from
 * `rotateSession`, which reuses an existing session's identity.
 */
async function issueNewSession(
  user: UserDocument,
  context: RequestContext,
): Promise<AuthTokens & { sessionId: string }> {
  // The session must exist before we can sign tokens that embed its id, so
  // it's created with a placeholder hash/expiry and patched immediately after.
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: 'pending',
    userAgent: context.userAgent,
    ip: context.ip,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const accessToken = signAccessToken(toAccessPayload(user, session.id as string));
  const { token: refreshToken, expiresAt } = signRefreshToken({
    sub: user.id as string,
    sid: session.id as string,
  });

  session.refreshTokenHash = hashToken(refreshToken);
  session.expiresAt = expiresAt;
  await session.save();

  return { accessToken, refreshToken, sessionId: session.id as string };
}

export async function register(
  input: RegisterInput,
  context: RequestContext,
): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await User.hashPassword(input.password);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    authProvider: 'local',
  });

  const tokens = await issueNewSession(user, context);
  return { user, tokens };
}

export async function login(
  input: LoginInput,
  context: RequestContext,
): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user || !(await user.comparePassword(input.password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueNewSession(user, context);
  return { user, tokens };
}

/**
 * Handles the Google OAuth callback: exchanges the auth code, upserts the
 * User and their connected EmailAccount, and issues our own session tokens.
 * OAuth tokens are encrypted before persistence — see docs/SECURITY.md.
 */
export async function loginWithGoogle(
  code: string,
  context: RequestContext,
): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  const google = await exchangeCodeForTokens(code);

  let user = await User.findOne({ email: google.profile.email });
  if (!user) {
    user = await User.create({
      name: google.profile.name,
      email: google.profile.email,
      avatarUrl: google.profile.picture ?? null,
      authProvider: 'google',
      isEmailVerified: true,
    });
  }

  await EmailAccount.findOneAndUpdate(
    { user: user._id, emailAddress: google.profile.email },
    {
      user: user._id,
      provider: 'google',
      emailAddress: google.profile.email,
      accessTokenEncrypted: encrypt(google.accessToken),
      refreshTokenEncrypted: encrypt(google.refreshToken),
      tokenExpiresAt: new Date(google.expiryDate),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const tokens = await issueNewSession(user, context);
  return { user, tokens };
}

/**
 * Rotates the refresh token *in place* on the same Session document (same
 * `sid`, new hash) rather than creating a new session. This is what makes
 * reuse detection possible: if a client ever presents a refresh token whose
 * hash doesn't match what's currently stored for that session id, it must be
 * an old, already-rotated token — a strong signal of token theft — so the
 * session is deleted outright and the caller has to log in again.
 */
export async function rotateSession(rawRefreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const session = await Session.findOne({ _id: payload.sid, user: payload.sub }).select(
    '+refreshTokenHash',
  );

  if (!session || session.refreshTokenHash !== hashToken(rawRefreshToken)) {
    if (session) await session.deleteOne();
    throw ApiError.unauthorized('Session is no longer valid, please log in again');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    await session.deleteOne();
    throw ApiError.unauthorized('Session is no longer valid, please log in again');
  }

  const accessToken = signAccessToken(toAccessPayload(user, session.id as string));
  const { token: refreshToken, expiresAt } = signRefreshToken({
    sub: user.id as string,
    sid: session.id as string,
  });

  session.refreshTokenHash = hashToken(refreshToken);
  session.expiresAt = expiresAt;
  session.lastUsedAt = new Date();
  await session.save();

  return { accessToken, refreshToken };
}

/** Logs out the *current* device only — other sessions are untouched. */
export async function logoutSession(sessionId: string): Promise<void> {
  await Session.deleteOne({ _id: sessionId });
}

export interface SessionSummary {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: Date;
  lastUsedAt: Date;
  isCurrent: boolean;
}

export async function listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
  const sessions = await Session.find({ user: userId }).sort({ lastUsedAt: -1 });
  return sessions.map((s: SessionDocument) => ({
    id: s.id as string,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    isCurrent: (s.id as string) === currentSessionId,
  }));
}

/** A user may only revoke their own sessions — enforced by scoping the delete to `user`. */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await Session.deleteOne({ _id: sessionId, user: userId });
  if (result.deletedCount === 0) {
    throw ApiError.notFound('Session not found');
  }
}

/** "Log out everywhere else" — keeps the session making the request, revokes all others. */
export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const result = await Session.deleteMany({ user: userId, _id: { $ne: currentSessionId } });
  return result.deletedCount;
}

export async function getCurrentUser(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}
