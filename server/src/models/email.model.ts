import { Schema, model, Types, type Document } from 'mongoose';

/** One of Gmail's system categories this message was found under during sync. */
export type EmailCategory = 'inbox' | 'sent' | 'drafts' | 'promotions' | 'social' | 'other';

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  /** Gmail's attachment id — passed back to the Gmail API to fetch the actual bytes on demand. */
  attachmentId: string;
}

/**
 * Content-based classification produced by the AI processing pipeline
 * (server/src/modules/ai/emailProcessing.service.ts) — distinct from the
 * Gmail-label-derived `category` above, which describes *where* Gmail filed
 * the message (inbox/sent/promotions/...), not what it's about.
 */
export const EMAIL_AI_CATEGORIES = [
  'jobs',
  'shopping',
  'finance',
  'bills',
  'marketing',
  'personal',
  'government',
  'travel',
  'university',
  'spam',
] as const;
export type EmailAiCategory = (typeof EMAIL_AI_CATEGORIES)[number];

export const EMAIL_AI_PRIORITIES = ['high', 'medium', 'low'] as const;
export type EmailAiPriority = (typeof EMAIL_AI_PRIORITIES)[number];

export const EMAIL_AI_ACTIONS = ['reply', 'ignore', 'archive', 'reminder', 'follow_up'] as const;
export type EmailAiAction = (typeof EMAIL_AI_ACTIONS)[number];

export type EmailAiStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EmailDocument extends Document {
  thread: Types.ObjectId;
  emailAccount: Types.ObjectId;
  providerMessageId: string;
  providerDraftId: string | null;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
  isRead: boolean;
  isDraft: boolean;
  category: EmailCategory;
  labelIds: string[];
  attachments: EmailAttachment[];

  /** Plain-text, tag-free rendering of the message body — see textExtraction.service.ts. */
  cleanText: string;
  aiSummary: string | null;
  aiCategory: EmailAiCategory | null;
  aiPriority: EmailAiPriority | null;
  aiAction: EmailAiAction | null;
  aiStatus: EmailAiStatus;
  aiError: string | null;
  aiProcessedAt: Date | null;
  aiTokens: { prompt: number; completion: number };

  /**
   * Vector embedding of this email's content, used for semantic search / RAG
   * (docs/RAG_AND_DASHBOARDS.md). `select: false` — this is a ~1536-number
   * array (~12KB as JSON) that no API response should ever serialize; it's
   * only pulled in explicitly by vectorSearch.service.ts's local fallback.
   */
  embedding: number[];
  embeddingModel: string | null;
  embeddingGeneratedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<EmailAttachment>(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    attachmentId: { type: String, required: true },
  },
  { _id: false },
);

const emailSchema = new Schema<EmailDocument>(
  {
    thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
    emailAccount: { type: Schema.Types.ObjectId, ref: 'EmailAccount', required: true, index: true },
    providerMessageId: { type: String, required: true },
    providerDraftId: { type: String, default: null },
    from: { type: String, required: true },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    subject: { type: String, default: '' },
    snippet: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    // Sanitized server-side (sanitize-html) before storage - see gmail/gmail.mapper.ts
    bodyHtml: { type: String, default: '' },
    receivedAt: { type: Date, required: true, index: true },
    isRead: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
    category: {
      type: String,
      enum: ['inbox', 'sent', 'drafts', 'promotions', 'social', 'other'],
      default: 'other',
      index: true,
    },
    labelIds: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },

    cleanText: { type: String, default: '' },
    aiSummary: { type: String, default: null },
    // No `enum` constraint on the three AI-derived fields below: they're set
    // from an LLM response that's already defensively validated/clamped in
    // application code (see emailProcessing.service.ts) before it ever
    // reaches Mongoose, so a second enforcement layer here would be
    // redundant. `category` above stays enum-constrained because it's
    // always set by our own deterministic derivation, never an LLM guess.
    aiCategory: { type: String, default: null, index: true },
    aiPriority: { type: String, default: null },
    aiAction: { type: String, default: null },
    aiStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    aiError: { type: String, default: null },
    aiProcessedAt: { type: Date, default: null },
    aiTokens: {
      prompt: { type: Number, default: 0 },
      completion: { type: Number, default: 0 },
    },

    embedding: { type: [Number], default: [], select: false },
    embeddingModel: { type: String, default: null },
    embeddingGeneratedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        // Defense in depth on top of `select: false` above — this field
        // must never reach a JSON response even if a future query
        // explicitly re-selects it.
        Reflect.deleteProperty(ret, 'embedding');
        Reflect.deleteProperty(ret, '__v');
        return ret;
      },
    },
  },
);

emailSchema.index({ emailAccount: 1, providerMessageId: 1 }, { unique: true });
// Powers GET /emails?category=... pagination sorted by recency.
emailSchema.index({ emailAccount: 1, category: 1, receivedAt: -1 });
// Powers GET /emails?aiCategory=...&aiPriority=... pagination sorted by recency.
emailSchema.index({ emailAccount: 1, aiCategory: 1, aiPriority: 1, receivedAt: -1 });
// Used by vectorSearch.service.ts's local (non-Atlas) brute-force fallback
// to cheaply find candidate emails that actually have an embedding yet.
emailSchema.index({ emailAccount: 1, embeddingGeneratedAt: -1 });

export const Email = model<EmailDocument>('Email', emailSchema);
