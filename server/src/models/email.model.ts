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
    // Sanitized server-side (sanitize-html) before storage - see gmail/emailSync.service.ts
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
  },
  { timestamps: true },
);

emailSchema.index({ emailAccount: 1, providerMessageId: 1 }, { unique: true });
// Powers GET /emails?category=... pagination sorted by recency.
emailSchema.index({ emailAccount: 1, category: 1, receivedAt: -1 });

export const Email = model<EmailDocument>('Email', emailSchema);
