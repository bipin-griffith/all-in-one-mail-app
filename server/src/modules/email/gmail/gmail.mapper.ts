import type { gmail_v1 } from 'googleapis';
import sanitizeHtml from 'sanitize-html';

import type { EmailAttachment, EmailCategory } from '../../../models/email.model';

/**
 * Pure functions that turn a raw Gmail message into the shape we persist.
 * Kept separate from gmail.service.ts (API calls) and emailSync.service.ts
 * (persistence/orchestration) so the parsing rules — which header wins,
 * which label maps to which category, how HTML is sanitized — are testable
 * in isolation and have exactly one place to change.
 */

function header(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractBody(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: 'text/plain' | 'text/html',
): string {
  if (!part) return '';

  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }

  for (const child of part.parts ?? []) {
    const result = extractBody(child, mimeType);
    if (result) return result;
  }

  return '';
}

function extractAttachments(part: gmail_v1.Schema$MessagePart | undefined): EmailAttachment[] {
  if (!part) return [];

  const attachments: EmailAttachment[] = [];

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body.size ?? 0,
      attachmentId: part.body.attachmentId,
    });
  }

  for (const child of part.parts ?? []) {
    attachments.push(...extractAttachments(child));
  }

  return attachments;
}

/**
 * A message commonly carries several label ids at once (e.g. INBOX +
 * CATEGORY_PROMOTIONS). We still want one primary `category` for simple
 * filtering (`GET /emails?category=promotions`), so priority order picks
 * the most specific/intentional label first — a draft or sent message is
 * never miscategorized as a promotion just because Gmail also tagged it.
 */
export function deriveCategory(labelIds: string[]): EmailCategory {
  if (labelIds.includes('DRAFT')) return 'drafts';
  if (labelIds.includes('SENT')) return 'sent';
  if (labelIds.includes('CATEGORY_PROMOTIONS')) return 'promotions';
  if (labelIds.includes('CATEGORY_SOCIAL')) return 'social';
  if (labelIds.includes('INBOX')) return 'inbox';
  return 'other';
}

export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
  labelIds: string[];
  category: EmailCategory;
  attachments: EmailAttachment[];
}

export function normalizeMessage(message: gmail_v1.Schema$Message): NormalizedMessage {
  if (!message.id || !message.threadId) {
    throw new Error('Gmail message is missing id/threadId');
  }

  const headers = message.payload?.headers ?? [];
  const labelIds = message.labelIds ?? [];

  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    from: header(headers, 'From'),
    to: splitAddresses(header(headers, 'To')),
    cc: splitAddresses(header(headers, 'Cc')),
    subject: header(headers, 'Subject'),
    snippet: message.snippet ?? '',
    bodyText: extractBody(message.payload, 'text/plain'),
    bodyHtml: sanitizeHtml(extractBody(message.payload, 'text/html'), {
      allowedTags: sanitizeHtml.defaults.allowedTags.filter((t) => t !== 'script'),
    }),
    receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    labelIds,
    category: deriveCategory(labelIds),
    attachments: extractAttachments(message.payload),
  };
}
