import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export function buildGoogleConsentUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent', // force refresh_token on repeat logins too
    scope: GMAIL_SCOPES,
  });
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  profile: { email: string; name: string; picture?: string };
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResult> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error(
      'Google did not return a refresh token. Revoke prior app access and retry with consent prompt.',
    );
  }

  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token ?? '',
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error('Unable to resolve Google account email from id token');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    profile: {
      email: payload.email,
      name: payload.name ?? payload.email,
      picture: payload.picture,
    },
  };
}
