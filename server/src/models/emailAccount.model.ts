import { Schema, model, Types, type Document } from 'mongoose';

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
}

export interface EmailAccountDocument extends Document {
  user: Types.ObjectId;
  provider: 'google';
  emailAddress: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
  historyId: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  /**
   * When the current 'syncing' status began. Lets `triggerSync` distinguish
   * a genuinely in-flight sync from one whose worker died mid-job (e.g. a
   * process restart) without ever flipping status back to 'idle'/'error' —
   * see `email.service.ts#isSyncLockStale`.
   */
  syncStartedAt: Date | null;
  lastSyncedAt: Date | null;
  /**
   * The mailbox's label list (system labels like INBOX/SENT plus any
   * user-created ones), refreshed on every sync. Denormalized onto the
   * account rather than a separate Label collection — it's small
   * (a few dozen entries at most), scoped 1:1 to the account, and read far
   * more often than it changes, so embedding avoids a pointless join.
   */
  labels: GmailLabel[];
  createdAt: Date;
  updatedAt: Date;
}

const labelSchema = new Schema<GmailLabel>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['system', 'user'], required: true },
  },
  { _id: false },
);

const emailAccountSchema = new Schema<EmailAccountDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['google'], required: true },
    emailAddress: { type: String, required: true, lowercase: true, trim: true },
    accessTokenEncrypted: { type: String, required: true, select: false },
    refreshTokenEncrypted: { type: String, required: true, select: false },
    tokenExpiresAt: { type: Date, required: true },
    historyId: { type: String, default: null },
    syncStatus: { type: String, enum: ['idle', 'syncing', 'error'], default: 'idle' },
    syncStartedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    labels: { type: [labelSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        Reflect.deleteProperty(ret, 'accessTokenEncrypted');
        Reflect.deleteProperty(ret, 'refreshTokenEncrypted');
        Reflect.deleteProperty(ret, '__v');
        return ret;
      },
    },
  },
);

emailAccountSchema.index({ user: 1, emailAddress: 1 }, { unique: true });

export const EmailAccount = model<EmailAccountDocument>('EmailAccount', emailAccountSchema);
