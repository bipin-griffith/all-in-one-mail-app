import { User } from '../../models/user.model';
import { ApiError } from '../../utils/ApiError';

/**
 * Shared quota logic for every *user-initiated* AI action (manual
 * summarize/draft/classify in ai.service.ts, and POST /chat in
 * chat.service.ts). Extracted so both call sites enforce the exact same
 * per-plan monthly allowance instead of drifting.
 *
 * Deliberately NOT used by the automatic per-email pipeline
 * (emailProcessing.service.ts) — that pipeline runs on every synced email
 * regardless of plan, so gating it behind this same counter would let a
 * single mailbox bootstrap-sync exhaust a user's entire monthly quota
 * before they ever manually asked the assistant to do anything. See
 * docs/AI_PIPELINE.md §5 and docs/RAG_AND_DASHBOARDS.md.
 */
const PLAN_QUOTAS: Record<'free' | 'pro', number> = {
  free: 50,
  pro: 2000,
};

const QUOTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function assertQuotaAndIncrement(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const now = new Date();
  if (now.getTime() > user.aiUsage.resetAt.getTime() + QUOTA_WINDOW_MS) {
    user.aiUsage.count = 0;
    user.aiUsage.resetAt = now;
  }

  const limit = PLAN_QUOTAS[user.plan];
  if (user.aiUsage.count >= limit) {
    throw new ApiError(429, `AI usage quota exceeded for the ${user.plan} plan (${limit}/mo)`);
  }

  user.aiUsage.count += 1;
  await user.save();
}
