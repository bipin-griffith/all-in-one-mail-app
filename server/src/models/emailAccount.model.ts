import { Schema, model, Types, type Document } from 'mongoose';

export interface EmailAccountDocument extends Document {
  user: Types.ObjectId;
  provider: 'google';
  emailAddress: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
  historyId: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
    lastSyncedAt: { type: Date, default: null },
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
