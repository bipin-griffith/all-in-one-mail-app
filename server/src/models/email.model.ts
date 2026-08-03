import { Schema, model, Types, type Document } from 'mongoose';

export interface EmailDocument extends Document {
  thread: Types.ObjectId;
  emailAccount: Types.ObjectId;
  providerMessageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emailSchema = new Schema<EmailDocument>(
  {
    thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
    emailAccount: { type: Schema.Types.ObjectId, ref: 'EmailAccount', required: true, index: true },
    providerMessageId: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    subject: { type: String, default: '' },
    snippet: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    // Sanitized server-side (sanitize-html) before storage - see email.service.ts
    bodyHtml: { type: String, default: '' },
    receivedAt: { type: Date, required: true, index: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

emailSchema.index({ emailAccount: 1, providerMessageId: 1 }, { unique: true });

export const Email = model<EmailDocument>('Email', emailSchema);
