import crypto from 'node:crypto';

import { EmailAccount } from '../../models/emailAccount.model';
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

function toAccessPayload(user: UserDocument): AccessTokenPayload {
  return { sub: user.id as string, email: user.email, role: user.role };
}

async function issueTokens(user: UserDocument): Promise<AuthTokens> {
  const accessToken = signAccessToken(toAccessPayload(user));
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id as string, tokenId });

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<{ user: UserDocument; tokens: AuthTokens }> {
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

  const tokens = await issueTokens(user);
  return { user, tokens };
}

export async function login(input: LoginInput): Promise<{ user: UserDocument; tokens: AuthTokens }> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user || !(await user.comparePassword(input.password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user);
  return { user, tokens };
}

/**
 * Handles the Google OAuth callback: exchanges the auth code, upserts the
 * User and their connected EmailAccount, and issues our own session tokens.
 * OAuth tokens are encrypted before persistence — see docs/SECURITY.md.
 */
export async function loginWithGoogle(
  code: string,
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

  const tokens = await issueTokens(user);
  return { user, tokens };
}

export async function refreshSession(rawRefreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user?.refreshTokenHash || user.refreshTokenHash !== hashToken(rawRefreshToken)) {
    // Reused/stale token presented — treat as compromised and force re-login.
    if (user) {
      user.refreshTokenHash = null;
      await user.save();
    }
    throw ApiError.unauthorized('Refresh token is no longer valid, please log in again');
  }

  return issueTokens(user);
}

export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

export async function getCurrentUser(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}
