import { google, type gmail_v1 } from 'googleapis';

import { EmailAccount, type EmailAccountDocument } from '../../../models/emailAccount.model';
import { ApiError } from '../../../utils/ApiError';
import { decrypt, encrypt } from '../../../utils/crypto';
import { createOAuthClient } from '../../auth/google.oauth';

export interface AuthenticatedGmail {
  gmail: gmail_v1.Gmail;
  account: EmailAccountDocument;
}

/**
 * Builds an authenticated Gmail client for a stored EmailAccount, refreshing
 * the Google access token if it's expired.
 *
 * Design decision: token refresh is persisted here, at the single point
 * where every Gmail call originates, rather than duplicated in each service
 * function. `googleapis`'s OAuth2Client emits a `tokens` event whenever it
 * silently refreshes — we listen for that and re-encrypt + save the new
 * access token, so subsequent syncs reuse it instead of hitting Google's
 * token endpoint on every single call.
 */
export async function getAuthenticatedGmailClient(accountId: string): Promise<AuthenticatedGmail> {
  const account = await EmailAccount.findById(accountId).select(
    '+accessTokenEncrypted +refreshTokenEncrypted',
  );
  if (!account) {
    throw ApiError.notFound('Email account not found');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decrypt(account.accessTokenEncrypted),
    refresh_token: decrypt(account.refreshTokenEncrypted),
    expiry_date: account.tokenExpiresAt.getTime(),
  });

  client.on('tokens', (tokens) => {
    void (async () => {
      if (tokens.access_token) {
        account.accessTokenEncrypted = encrypt(tokens.access_token);
        if (tokens.expiry_date) account.tokenExpiresAt = new Date(tokens.expiry_date);
        await account.save();
      }
    })();
  });

  const gmail = google.gmail({ version: 'v1', auth: client });
  return { gmail, account };
}
