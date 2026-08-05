import { Schema, model, Types, type Document } from 'mongoose';

/**
 * One document per logged-in device/browser. Replaces the earlier design of
 * a single `refreshTokenHash` field on User, which silently invalidated a
 * user's other session on every new login and offered no way to audit or
 * revoke individual devices. See docs/AUTH_AND_GMAIL.md for the full
 * rationale.
 *
 * There is no `revokedAt`/soft-delete flag by design: "revoked" and "does
 * not exist" are the same state here, so revocation is just deleting the
 * document. That also makes refresh-token-reuse detection simple — if a
 * presented token's hash doesn't match the session's *current* hash, the
 * session is deleted immediately (see auth.service.ts `rotateSession`),
 * which forces re-login on that device, exactly as if it were revoked.
 */
export interface SessionDocument extends Document {
  user: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionDocument>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshTokenHash: { type: String, required: true, select: false },
  userAgent: { type: String, default: 'unknown' },
  ip: { type: String, default: 'unknown' },
  createdAt: { type: Date, default: () => new Date() },
  lastUsedAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
});

// TTL index: MongoDB automatically deletes a session document once its
// expiresAt passes, so expired sessions never need a manual cleanup job.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<SessionDocument>('Session', sessionSchema);
