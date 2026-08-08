import { Email, type EmailDocument } from '../../models/email.model';
import { EmailAccount, type EmailAccountDocument } from '../../models/emailAccount.model';
import { Thread } from '../../models/thread.model';
import { ApiError } from '../../utils/ApiError';
import { enqueueEmailSync } from '../queue/queues/emailSync.queue';

import type { ListEmailsQuery, ListThreadsQuery, UpdateThreadInput } from './email.validation';
import { getAuthenticatedGmailClient } from './gmail/gmail.client';
import { getAttachment as fetchAttachmentFromGmail } from './gmail/gmail.service';

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

/**
 * How long a 'syncing' status is trusted as "a job is genuinely in flight."
 * Past this, it's treated as an orphaned lock (the worker that set it almost
 * certainly died mid-job — e.g. a restart — without ever reaching
 * syncAccount's try/catch to flip status back to 'idle'/'error') and a new
 * sync is allowed to proceed rather than leaving the account stuck forever.
 * A real sync (bootstrap or incremental) normally completes in seconds; ten
 * minutes gives generous headroom for a slow mailbox without letting a lost
 * job block the user indefinitely.
 */
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;

function isSyncLockStale(account: EmailAccountDocument): boolean {
  if (account.syncStatus !== 'syncing') return false;
  if (!account.syncStartedAt) return true;
  return Date.now() - account.syncStartedAt.getTime() > SYNC_LOCK_STALE_MS;
}

/**
 * Marks the account "syncing" and enqueues the job. If enqueueing itself
 * fails (e.g. Redis briefly unreachable), the status is rolled back to
 * "error" rather than left stuck on "syncing" forever with no job actually
 * queued to ever resolve it.
 */
async function markSyncingAndEnqueue(account: EmailAccountDocument): Promise<string> {
  account.syncStatus = 'syncing';
  account.syncStartedAt = new Date();
  await account.save();

  try {
    return await enqueueEmailSync(account.id as string);
  } catch (err) {
    account.syncStatus = 'error';
    await account.save();
    throw err;
  }
}

export async function triggerSync(userId: string, accountId: string): Promise<string> {
  const account = await getOwnedEmailAccount(userId, accountId);
  if (account.syncStatus === 'syncing' && !isSyncLockStale(account)) {
    throw ApiError.badRequest('A sync is already in progress for this account');
  }
  return markSyncingAndEnqueue(account);
}

/** POST /sync — syncs every mailbox the user has connected (usually just one). */
export async function triggerSyncAll(userId: string): Promise<string[]> {
  const accounts = await EmailAccount.find({ user: userId });
  if (accounts.length === 0) {
    throw ApiError.badRequest('No connected email accounts to sync');
  }

  const jobIds: string[] = [];
  for (const account of accounts) {
    if (account.syncStatus === 'syncing' && !isSyncLockStale(account)) continue;
    jobIds.push(await markSyncingAndEnqueue(account));
  }
  return jobIds;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export async function listThreads(userId: string, query: ListThreadsQuery): Promise<Paginated<unknown>> {
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
 * GET /emails — reads from our MongoDB cache, not live Gmail. This is
 * intentional: Gmail stays the source of truth (see docs/DATABASE.md), but
 * every list/search/pagination request the product makes goes through our
 * own indexed collection instead of the Gmail API, which is both far faster
 * and avoids Gmail's per-user rate limits on every page load.
 */
export async function listEmails(userId: string, query: ListEmailsQuery): Promise<Paginated<EmailDocument>> {
  const accountIds = (await EmailAccount.find({ user: userId }).select('_id')).map((a) => a._id);

  const filter: Record<string, unknown> = { emailAccount: { $in: accountIds } };
  if (query.category) filter.category = query.category;
  if (query.aiCategory) filter.aiCategory = query.aiCategory;
  if (query.aiPriority) filter.aiPriority = query.aiPriority;
  if (query.aiAction) filter.aiAction = query.aiAction;
  if (query.isRead !== undefined) filter.isRead = query.isRead;
  if (query.threadId) filter.thread = query.threadId;
  if (query.q) filter.subject = { $regex: query.q, $options: 'i' };

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    Email.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(query.limit),
    Email.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

type EmailWithAccount = Omit<EmailDocument, 'emailAccount'> & { emailAccount: EmailAccountDocument };

async function getOwnedEmail(userId: string, emailId: string): Promise<EmailWithAccount> {
  const email = await Email.findById(emailId).populate<{ emailAccount: EmailAccountDocument }>(
    'emailAccount',
  );
  if (!email || String(email.emailAccount.user) !== userId) {
    throw ApiError.notFound('Email not found');
  }
  return email;
}

export async function getEmailById(userId: string, emailId: string): Promise<EmailWithAccount> {
  return getOwnedEmail(userId, emailId);
}

/**
 * Attachment bytes are never stored in MongoDB (see docs/AUTH_AND_GMAIL.md)
 * — only metadata is persisted during sync. A download request fetches the
 * actual content from Gmail on demand, scoped through our own ownership
 * check first so a user can only ever pull attachments off their own
 * connected mailbox.
 */
export async function getEmailAttachment(
  userId: string,
  emailId: string,
  attachmentId: string,
): Promise<{ data: Buffer; filename: string; mimeType: string }> {
  const email = await getOwnedEmail(userId, emailId);
  const meta = email.attachments.find((a) => a.attachmentId === attachmentId);
  if (!meta) {
    throw ApiError.notFound('Attachment not found');
  }

  const { gmail } = await getAuthenticatedGmailClient(email.emailAccount.id as string);
  const data = await fetchAttachmentFromGmail(gmail, email.providerMessageId, attachmentId);

  return { data, filename: meta.filename, mimeType: meta.mimeType };
}
