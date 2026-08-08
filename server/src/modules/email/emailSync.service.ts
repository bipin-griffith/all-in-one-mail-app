import type { gmail_v1 } from 'googleapis';

import { logger } from '../../config/logger';
import { Email } from '../../models/email.model';
import type { EmailAccountDocument } from '../../models/emailAccount.model';
import { Thread } from '../../models/thread.model';
import { enqueueEmailProcessing } from '../queue/queues/emailProcessing.queue';

import { getAuthenticatedGmailClient } from './gmail/gmail.client';
import { normalizeMessage } from './gmail/gmail.mapper';
import * as gmailApi from './gmail/gmail.service';

/** How many messages to pull per Gmail category on a brand-new account's first sync. */
const BOOTSTRAP_PAGE_SIZE = 50;

/**
 * Persists one Gmail message: upserts its parent Thread, then upserts the
 * Email itself. Both upserts key on the Gmail-assigned id
 * (providerThreadId / providerMessageId) scoped to the account, which is
 * what the unique indexes on Thread/Email enforce — so calling this twice
 * for the same message (e.g. it appears in both INBOX and
 * CATEGORY_PROMOTIONS during a bootstrap sync) safely converges to one
 * document instead of creating a duplicate. This is the single mechanism
 * that satisfies "avoid duplicate emails" everywhere in the sync pipeline.
 *
 * Whether the message is genuinely new is checked explicitly *before* the
 * upsert (rather than inferred from the upsert's result) — the AI
 * processing pipeline (docs/AI_PIPELINE.md) must only be triggered for
 * messages that are truly new, never for a message re-synced because e.g.
 * its read state changed, or because it showed up in more than one
 * category list in the same bootstrap run.
 */
async function persistMessage(
  account: EmailAccountDocument,
  raw: gmail_v1.Schema$Message,
  draftId: string | null = null,
): Promise<void> {
  const normalized = normalizeMessage(raw);

  const thread = await Thread.findOneAndUpdate(
    { emailAccount: account._id, providerThreadId: normalized.providerThreadId },
    {
      $setOnInsert: { emailAccount: account._id, providerThreadId: normalized.providerThreadId },
      $set: { subject: normalized.subject, lastMessageAt: normalized.receivedAt },
      $addToSet: { participants: normalized.from, labels: { $each: normalized.labelIds } },
    },
    { upsert: true, new: true },
  );

  const alreadyExists = await Email.exists({
    emailAccount: account._id,
    providerMessageId: normalized.providerMessageId,
  });

  const email = await Email.findOneAndUpdate(
    { emailAccount: account._id, providerMessageId: normalized.providerMessageId },
    {
      thread: thread._id,
      emailAccount: account._id,
      providerMessageId: normalized.providerMessageId,
      providerDraftId: draftId,
      from: normalized.from,
      to: normalized.to,
      cc: normalized.cc,
      subject: normalized.subject,
      snippet: normalized.snippet,
      bodyText: normalized.bodyText,
      bodyHtml: normalized.bodyHtml,
      receivedAt: normalized.receivedAt,
      isDraft: draftId !== null,
      category: normalized.category,
      labelIds: normalized.labelIds,
      attachments: normalized.attachments,
    },
    { upsert: true, new: true },
  );

  if (!alreadyExists) {
    await enqueueEmailProcessing(email.id as string);
  }
}

/** True for the 404 Gmail returns when the requested resource no longer exists. */
function isGmailNotFoundError(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 404;
}

/**
 * Fetches one message and persists it, tolerating the message having
 * vanished between being listed/referenced and being fetched (deleted by
 * the user, auto-purged as spam, etc. — a message id from `messages.list`
 * or `history.list` is not a guarantee the message still exists by the time
 * we get around to `messages.get`). Without this, a single disappeared
 * message would throw and abort the rest of an otherwise-healthy sync — and
 * since the failure recurs identically on every retry, the account would be
 * permanently stuck unable to sync past that one dead message id.
 */
async function fetchAndPersistMessage(
  gmail: gmail_v1.Gmail,
  account: EmailAccountDocument,
  messageId: string,
  draftId: string | null = null,
): Promise<void> {
  let message: gmail_v1.Schema$Message;
  try {
    message = await gmailApi.getMessage(gmail, messageId);
  } catch (err) {
    if (!isGmailNotFoundError(err)) throw err;
    logger.warn(`message ${messageId} no longer exists on account ${account.id as string}, skipping`);
    return;
  }
  await persistMessage(account, message, draftId);
}

/**
 * First-ever sync for an account: no `historyId` cursor exists yet, so we
 * can't ask Gmail "what changed" — instead we explicitly pull a bounded page
 * from each category the product cares about (inbox/sent/promotions/social)
 * plus drafts. A message can legitimately appear in more than one of those
 * lists (inbox + promotions is common), so message ids are deduplicated in
 * a Set *before* fetching full message bodies — this is purely a
 * performance/API-quota optimization on top of the DB-level dedupe above,
 * avoiding redundant `messages.get` calls for the same message.
 */
async function bootstrapSync(gmail: gmail_v1.Gmail, account: EmailAccountDocument): Promise<void> {
  const [inbox, sent, promotions, social, drafts] = await Promise.all([
    gmailApi.listInbox(gmail, { maxResults: BOOTSTRAP_PAGE_SIZE }),
    gmailApi.listSent(gmail, { maxResults: BOOTSTRAP_PAGE_SIZE }),
    gmailApi.listPromotions(gmail, { maxResults: BOOTSTRAP_PAGE_SIZE }),
    gmailApi.listSocial(gmail, { maxResults: BOOTSTRAP_PAGE_SIZE }),
    gmailApi.listDrafts(gmail, { maxResults: BOOTSTRAP_PAGE_SIZE }),
  ]);

  const draftMessageIds = new Set(drafts.drafts.map((d) => d.messageId));
  const draftIdByMessageId = new Map(drafts.drafts.map((d) => [d.messageId, d.draftId]));

  const regularMessageIds = new Set(
    [...inbox.messageIds, ...sent.messageIds, ...promotions.messageIds, ...social.messageIds].filter(
      (id) => !draftMessageIds.has(id),
    ),
  );

  for (const messageId of regularMessageIds) {
    await fetchAndPersistMessage(gmail, account, messageId);
  }

  for (const messageId of draftMessageIds) {
    await fetchAndPersistMessage(gmail, account, messageId, draftIdByMessageId.get(messageId) ?? null);
  }
}

/**
 * Every sync after the first one: Gmail's history API returns everything
 * that changed since `startHistoryId` in one call, regardless of which
 * label/category it's under — far cheaper than re-listing every category.
 *
 * Gmail only retains history for a limited window (about a week); past
 * that, `startHistoryId` is rejected with a 404 and there is no way to
 * recover the missed changes incrementally. Rather than let that 404
 * permanently fail every future sync for the account (the old behavior —
 * `historyId` never changes, so every retry hit the exact same error), we
 * fall back to a full `bootstrapSync`, which re-derives current mailbox
 * state directly. `persistMessage`'s existing dedupe means re-fetching
 * already-known messages is a safe no-op, not a source of duplicates.
 */
async function incrementalSync(gmail: gmail_v1.Gmail, account: EmailAccountDocument): Promise<void> {
  let messageIds: string[];
  try {
    messageIds = await gmailApi.listHistorySinceMessageAdded(gmail, account.historyId as string);
  } catch (err) {
    if (!isGmailNotFoundError(err)) throw err;
    logger.warn(`historyId stale for account ${account.id as string}, falling back to full bootstrap sync`);
    await bootstrapSync(gmail, account);
    return;
  }

  for (const messageId of messageIds) {
    await fetchAndPersistMessage(gmail, account, messageId);
  }
}

/**
 * Top-level entry point, called by the BullMQ worker (never inline in an
 * HTTP request — see docs/ARCHITECTURE.md's AI/sync job lifecycle). Chooses
 * bootstrap vs. incremental based on whether a historyId cursor already
 * exists, then always refreshes the mailbox's label list so "Read Labels"
 * stays current even on accounts that never re-bootstrap.
 */
export async function syncAccount(accountId: string): Promise<void> {
  const { gmail, account } = await getAuthenticatedGmailClient(accountId);

  try {
    account.labels = await gmailApi.listLabels(gmail);

    if (account.historyId) {
      await incrementalSync(gmail, account);
    } else {
      await bootstrapSync(gmail, account);
    }

    account.historyId = (await gmailApi.getHistoryId(gmail)) ?? account.historyId;
    account.syncStatus = 'idle';
    account.lastSyncedAt = new Date();
    await account.save();
  } catch (err) {
    logger.error(`Gmail sync failed for account ${accountId}: ${(err as Error).message}`);
    account.syncStatus = 'error';
    await account.save();
    throw err;
  }
}
