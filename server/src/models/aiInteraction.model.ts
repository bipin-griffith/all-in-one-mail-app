import { Schema, model, Types, type Document } from 'mongoose';

export type AiInteractionType = 'summarize' | 'draft_reply' | 'classify';
export type AiInteractionStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AiInteractionDocument extends Document {
  user: Types.ObjectId;
  thread: Types.ObjectId | null;
  type: AiInteractionType;
  status: AiInteractionStatus;
  jobId: string;
  promptTokens: number;
  completionTokens: number;
  result: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const aiInteractionSchema = new Schema<AiInteractionDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    thread: { type: Schema.Types.ObjectId, ref: 'Thread', default: null },
    type: { type: String, enum: ['summarize', 'draft_reply', 'classify'], required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
    },
    jobId: { type: String, required: true, index: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

aiInteractionSchema.index({ user: 1, createdAt: -1 });

export const AiInteraction = model<AiInteractionDocument>('AiInteraction', aiInteractionSchema);
