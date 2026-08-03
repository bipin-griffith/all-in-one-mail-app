import { Schema, model, Types, type Document } from 'mongoose';

export interface ThreadDocument extends Document {
  emailAccount: Types.ObjectId;
  providerThreadId: string;
  subject: string;
  participants: string[];
  lastMessageAt: Date;
  labels: string[];
  aiCategory: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const threadSchema = new Schema<ThreadDocument>(
  {
    emailAccount: { type: Schema.Types.ObjectId, ref: 'EmailAccount', required: true, index: true },
    providerThreadId: { type: String, required: true },
    subject: { type: String, default: '' },
    participants: { type: [String], default: [] },
    lastMessageAt: { type: Date, required: true },
    labels: { type: [String], default: [] },
    aiCategory: { type: String, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

threadSchema.index({ emailAccount: 1, providerThreadId: 1 }, { unique: true });
threadSchema.index({ emailAccount: 1, lastMessageAt: -1 });

export const Thread = model<ThreadDocument>('Thread', threadSchema);
