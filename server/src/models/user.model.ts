import bcrypt from 'bcryptjs';
import { Schema, model, type Document, type Model } from 'mongoose';

export interface UserAiUsage {
  count: number;
  resetAt: Date;
}

export interface UserDocument extends Document {
  name: string;
  email: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  authProvider: 'local' | 'google';
  role: 'user' | 'admin';
  isEmailVerified: boolean;
  plan: 'free' | 'pro';
  aiUsage: UserAiUsage;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

interface UserModel extends Model<UserDocument> {
  hashPassword(plain: string): Promise<string>;
}

const userSchema = new Schema<UserDocument, UserModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, default: null, select: false },
    avatarUrl: { type: String, default: null },
    authProvider: { type: String, enum: ['local', 'google'], required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isEmailVerified: { type: Boolean, default: false },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    aiUsage: {
      count: { type: Number, default: 0 },
      resetAt: { type: Date, default: () => new Date() },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        Reflect.deleteProperty(ret, 'passwordHash');
        Reflect.deleteProperty(ret, '__v');
        return ret;
      },
    },
  },
);

userSchema.methods.comparePassword = async function comparePassword(
  this: UserDocument,
  candidate: string,
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
};

export const User = model<UserDocument, UserModel>('User', userSchema);
