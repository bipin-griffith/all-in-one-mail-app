import { google } from 'googleapis';
import sanitizeHtml from 'sanitize-html';

import { logger } from '../../config/logger';
import { Email } from '../../models/email.model';
import { EmailAccount, type EmailAccountDocument } from '../../models/emailAccount.model';
import { Thread } from '../../models/thread.model';
import { ApiError } from '../../utils/ApiError';
import { decrypt, encrypt } from '../../utils/crypto';
import { createOAuthClient } from '../auth/google.oauth';
import { enqueueEmailSync } from '../queue/queues/emailSync.queue';

import type { ListThreadsQuery, UpdateThreadInput } from './email.validation';

export async function listEmailAccounts(userId: string): Promise<EmailAccountDocument[]> {
  return EmailAccount.find({ user: userId }).sort({ createdAt: -1 });
}

async function getOwnedEmailAccount(userId: string, accountId: string): Promise<EmailAccountDocument> {
  const account = await EmailAccount.findOne({ _id: accountId, user: userId });
  if (!account) {
    throw ApiError.notFound('Email account not found');
  }
  return account;
}

export async function disconnectEmailAccount(userId: string, accountId: string): Promise<void> {
  const account = await getOwnedEmailAccount(userId, accountId);
  await Promise.all([
    Thread.deleteMany({ emailAccount: account._id }),
    Email.deleteMany({ emailAccount: account._id }),
    account.deleteOne(),
  ]);
}

export async function triggerSync(userId: string, accountId: string): Promise<string> {
  const account = await getOwnedEmailAccount(userId, accountId);
  account.syncStatus = 'syncing';
  await account.save();
  return enqueueEmailSync(account.id as string);
}

interface PaginatedThreads {
  items: Awaited<ReturnType<typeof Thread.find>>;
  total: number;
  page: number;
  limit: number;
}

export async function listThreads(userId: string, query: ListThreadsQuery): Promise<PaginatedThreads> {
  const accountIds = (await EmailAccount.find({ user: userId }).select('_id')).map((a) => a._id);

  const filter: Record<string, unknown> = { emailAccount: { $in: accountIds } };
  if (query.category) filter.aiCategory = query.category;
  if (query.q) filter.subject = { $regex: query.q, $options: 'i' };

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    Thread.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(query.limit),
    Thread.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function getThreadDetail(userId: string, threadId: string) {
  const thread = await Thread.findById(threadId).populate<{
    emailAccount: EmailAccountDocument;
  }>('emailAccount');

  if (!thread || String(thread.emailAccount.user) !== userId) {
    throw ApiError.notFound('Thread not found');
  }

  const emails = await Email.find({ thread: thread._id }).sort({ receivedAt: 1 });
  return { thread, emails };
}

export async function updateThread(userId: string, threadId: string, patch: UpdateThreadInput) {
  const { thread } = await getThreadDetail(userId, threadId);
  Object.assign(thread, patch);
  await thread.save();
  return thread;
}

/**
 * Refreshes the Google access token if needed and returns an authenticated
 * Gmail client. Persists the refreshed access token (re-encrypted) so
 * subsequent syncs reuse it instead of refreshing on every call.
 */
async function getGmailClient(account: EmailAccountDocument) {
  const fullAccount = await EmailAccount.findById(account._id).select(
    '+accessTokenEncrypted +refreshTokenEncrypted',
  );
  if (!fullAccount) throw ApiError.notFound('Email account not found');

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decrypt(fullAccount.accessTokenEncrypted),
    refresh_token: decrypt(fullAccount.refreshTokenEncrypted),
    expiry_date: fullAccount.tokenExpiresAt.getTime(),
  });

  client.on('tokens', (tokens) => {
    void (async () => {
      if (tokens.access_token) {
        fullAccount.accessTokenEncrypted = encrypt(tokens.access_token);
        if (tokens.expiry_date) fullAccount.tokenExpiresAt = new Date(tokens.expiry_date);
        await fullAccount.save();
      }
    })();
  });

  return google.gmail({ version: 'v1', auth: client });
}

/**
 * Incremental Gmail sync using the stored `historyId` cursor. Falls back to
 * a bounded initial pull (most recent 50 threads) when no cursor exists yet.
 * Runs inside the BullMQ worker, not the request/response cycle.
 */
export async function performGmailSync(emailAccountId: string): Promise<void> {
  const account = await EmailAccount.findById(emailAccountId);
  if (!account) return;

  try {
    const gmail = await getGmailClient(account);

    const messageIds: string[] = [];

    if (account.historyId) {
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: account.historyId,
        historyTypes: ['messageAdded'],
      });
      for (const record of history.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) messageIds.push(added.message.id);
        }
      }
    } else {
      const list = await gmail.users.messages.list({ userId: 'me', maxResults: 50 });
      for (const msg of list.data.messages ?? []) {
        if (msg.id) messageIds.push(msg.id);
      }
    }

    for (const messageId of messageIds) {
      await syncSingleMessage(gmail, account, messageId);
    }

    const profile = await gmail.users.getProfile({ userId: 'me' });
    account.historyId = profile.data.historyId ?? account.historyId;
    account.syncStatus = 'idle';
    account.lastSyncedAt = new Date();
    await account.save();
  } catch (err) {
    logger.error(`Gmail sync failed for account ${emailAccountId}: ${(err as Error).message}`);
    account.syncStatus = 'error';
    await account.save();
    throw err;
  }
}

function header(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

async function syncSingleMessage(
  gmail: ReturnType<typeof google.gmail>,
  account: EmailAccountDocument,
  messageId: string,
): Promise<void> {
  const { data: message } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = message.payload?.headers ?? [];
  const bodyHtmlRaw = extractBody(message.payload, 'text/html');
  const bodyTextRaw = extractBody(message.payload, 'text/plain');

  const thread = await Thread.findOneAndUpdate(
    { emailAccount: account._id, providerThreadId: message.threadId },
    {
      $setOnInsert: {
        emailAccount: account._id,
        providerThreadId: message.threadId,
      },
      $set: {
        subject: header(headers, 'Subject'),
        lastMessageAt: new Date(Number(message.internalDate ?? Date.now())),
      },
      $addToSet: { participants: header(headers, 'From') },
    },
    { upsert: true, new: true },
  );

  await Email.findOneAndUpdate(
    { emailAccount: account._id, providerMessageId: message.id },
    {
      thread: thread._id,
      emailAccount: account._id,
      providerMessageId: message.id,
      from: header(headers, 'From'),
      to: header(headers, 'To').split(',').map((s) => s.trim()).filter(Boolean),
      cc: header(headers, 'Cc').split(',').map((s) => s.trim()).filter(Boolean),
      subject: header(headers, 'Subject'),
      snippet: message.snippet ?? '',
      bodyText: bodyTextRaw,
      bodyHtml: sanitizeHtml(bodyHtmlRaw, {
        allowedTags: sanitizeHtml.defaults.allowedTags.filter((t) => t !== 'script'),
      }),
      receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    },
    { upsert: true },
  );
}

interface GmailMessagePart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
}

function extractBody(payload: GmailMessagePart | undefined, mimeType: 'text/plain' | 'text/html'): string {
  if (!payload) return '';

  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  }

  for (const part of payload.parts ?? []) {
    const result = extractBody(part, mimeType);
    if (result) return result;
  }

  return '';
}
