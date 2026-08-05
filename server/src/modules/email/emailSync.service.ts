import type { gmail_v1 } from 'googleapis';

import { logger } from '../../config/logger';
import { Email } from '../../models/email.model';
import type { EmailAccountDocument } from '../../models/emailAccount.model';
import { Thread } from '../../models/thread.model';

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

  await Email.findOneAndUpdate(
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
    { upsert: true },
  );
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
    const message = await gmailApi.getMessage(gmail, messageId);
    await persistMessage(account, message);
  }

  for (const messageId of draftMessageIds) {
    const message = await gmailApi.getMessage(gmail, messageId);
    await persistMessage(account, message, draftIdByMessageId.get(messageId) ?? null);
  }
}

/**
 * Every sync after the first one: Gmail's history API returns everything
 * that changed since `startHistoryId` in one call, regardless of which
 * label/category it's under — far cheaper than re-listing every category.
 */
async function incrementalSync(gmail: gmail_v1.Gmail, account: EmailAccountDocument): Promise<void> {
  const messageIds = await gmailApi.listHistorySinceMessageAdded(gmail, account.historyId as string);

  for (const messageId of messageIds) {
    const message = await gmailApi.getMessage(gmail, messageId);
    await persistMessage(account, message);
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
