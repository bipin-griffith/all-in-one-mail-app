import type { gmail_v1 } from 'googleapis';

/**
 * Thin adapter over the Gmail API — one function per read capability the
 * product needs (inbox/sent/drafts/promotions/social/labels/attachments/
 * threads). Each function does exactly one Gmail API call and returns a
 * small, typed shape; it never touches Mongo or interprets business rules.
 * That split is deliberate: `emailSync.service.ts` (orchestration) can be
 * unit-tested by mocking this module, and this module can be verified
 * against the real Gmail API without spinning up MongoDB.
 */

export interface MessageListPage {
  messageIds: string[];
  nextPageToken?: string;
}

async function listMessageIdsByLabel(
  gmail: gmail_v1.Gmail,
  labelIds: string[],
  opts: { maxResults?: number; pageToken?: string } = {},
): Promise<MessageListPage> {
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    labelIds,
    maxResults: opts.maxResults ?? 50,
    pageToken: opts.pageToken,
  });

  return {
    messageIds: (data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)),
    nextPageToken: data.nextPageToken ?? undefined,
  };
}

export const listInbox = (gmail: gmail_v1.Gmail, opts?: { maxResults?: number; pageToken?: string }) =>
  listMessageIdsByLabel(gmail, ['INBOX'], opts);

export const listSent = (gmail: gmail_v1.Gmail, opts?: { maxResults?: number; pageToken?: string }) =>
  listMessageIdsByLabel(gmail, ['SENT'], opts);

export const listPromotions = (
  gmail: gmail_v1.Gmail,
  opts?: { maxResults?: number; pageToken?: string },
) => listMessageIdsByLabel(gmail, ['CATEGORY_PROMOTIONS'], opts);

export const listSocial = (gmail: gmail_v1.Gmail, opts?: { maxResults?: number; pageToken?: string }) =>
  listMessageIdsByLabel(gmail, ['CATEGORY_SOCIAL'], opts);

export interface DraftRef {
  draftId: string;
  messageId: string;
}

/** Drafts are a distinct Gmail resource (not just a label) — listing them is a separate API call. */
export async function listDrafts(
  gmail: gmail_v1.Gmail,
  opts: { maxResults?: number; pageToken?: string } = {},
): Promise<{ drafts: DraftRef[]; nextPageToken?: string }> {
  const { data } = await gmail.users.drafts.list({
    userId: 'me',
    maxResults: opts.maxResults ?? 50,
    pageToken: opts.pageToken,
  });

  const drafts = (data.drafts ?? [])
    .filter((d): d is gmail_v1.Schema$Draft & { id: string; message: { id: string } } =>
      Boolean(d.id && d.message?.id),
    )
    .map((d) => ({ draftId: d.id, messageId: d.message.id }));

  return { drafts, nextPageToken: data.nextPageToken ?? undefined };
}

/** Incremental sync cursor: messages added since `startHistoryId`, across every label. */
export async function listHistorySinceMessageAdded(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<string[]> {
  const { data } = await gmail.users.history.list({
    userId: 'me',
    startHistoryId,
    historyTypes: ['messageAdded'],
  });

  const messageIds = new Set<string>();
  for (const record of data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (added.message?.id) messageIds.add(added.message.id);
    }
  }
  return [...messageIds];
}

export interface GmailLabelDto {
  id: string;
  name: string;
  type: 'system' | 'user';
}

export async function listLabels(gmail: gmail_v1.Gmail): Promise<GmailLabelDto[]> {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return (data.labels ?? [])
    .filter((l): l is gmail_v1.Schema$Label & { id: string; name: string } => Boolean(l.id && l.name))
    .map((l) => ({ id: l.id, name: l.name, type: l.type === 'system' ? 'system' : 'user' }));
}

export async function getMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<gmail_v1.Schema$Message> {
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return data;
}

/** Fetches a full thread directly from Gmail (as opposed to reading our own persisted copy). */
export async function getThread(
  gmail: gmail_v1.Gmail,
  threadId: string,
): Promise<gmail_v1.Schema$Thread> {
  const { data } = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  return data;
}

export async function getAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const { data } = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  if (!data.data) {
    throw new Error('Gmail returned no attachment data');
  }

  return Buffer.from(data.data, 'base64url');
}

export async function getHistoryId(gmail: gmail_v1.Gmail): Promise<string | null | undefined> {
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  return data.historyId;
}
