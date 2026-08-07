import { Types } from 'mongoose';

import { Email, type EmailAiCategory } from '../../models/email.model';
import { EmailAccount } from '../../models/emailAccount.model';

/**
 * Backs the Jobs/Shopping/Finance dashboards (and any other `aiCategory`)
 * through one parameterized endpoint/service function rather than three
 * near-identical copies — the same "one reusable thing, not N duplicates"
 * principle applied to the dashboard React components on the client side.
 */

async function getAccountIds(userId: string): Promise<Types.ObjectId[]> {
  const accounts = await EmailAccount.find({ user: userId }).select('_id');
  return accounts.map((a) => a._id);
}

function toCountRecord(agg: Array<{ _id: string | null; count: number }>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const item of agg) {
    record[item._id ?? 'unknown'] = item.count;
  }
  return record;
}

export interface CategoryDashboardEmail {
  id: string;
  subject: string;
  from: string;
  receivedAt: Date;
  aiSummary: string | null;
  aiPriority: string | null;
  aiAction: string | null;
}

export interface CategoryDashboard {
  category: EmailAiCategory;
  total: number;
  byPriority: Record<string, number>;
  byAction: Record<string, number>;
  recent: CategoryDashboardEmail[];
}

export async function getCategoryDashboard(
  userId: string,
  aiCategory: EmailAiCategory,
): Promise<CategoryDashboard> {
  const accountIds = await getAccountIds(userId);
  const filter = { emailAccount: { $in: accountIds }, aiCategory };

  const [total, byPriorityAgg, byActionAgg, recent] = await Promise.all([
    Email.countDocuments(filter),
    Email.aggregate<{ _id: string | null; count: number }>([
      { $match: filter },
      { $group: { _id: '$aiPriority', count: { $sum: 1 } } },
    ]),
    Email.aggregate<{ _id: string | null; count: number }>([
      { $match: filter },
      { $group: { _id: '$aiAction', count: { $sum: 1 } } },
    ]),
    Email.find(filter)
      .sort({ receivedAt: -1 })
      .limit(10)
      .select('subject from receivedAt aiSummary aiPriority aiAction'),
  ]);

  return {
    category: aiCategory,
    total,
    byPriority: toCountRecord(byPriorityAgg),
    byAction: toCountRecord(byActionAgg),
    recent: recent.map((e) => ({
      id: e.id as string,
      subject: e.subject,
      from: e.from,
      receivedAt: e.receivedAt,
      aiSummary: e.aiSummary,
      aiPriority: e.aiPriority,
      aiAction: e.aiAction,
    })),
  };
}

export interface TimeseriesBucket {
  /** 'YYYY-MM-DD' for daily granularity, 'YYYY-MM' for monthly. */
  date: string;
  total: number;
  unread: number;
}

/** Backs both the Daily Statistics and Monthly Statistics dashboards, parameterized by `granularity`. */
export async function getTimeseriesStats(
  userId: string,
  granularity: 'day' | 'month',
  range: number,
): Promise<TimeseriesBucket[]> {
  const accountIds = await getAccountIds(userId);

  const since = new Date();
  if (granularity === 'day') {
    since.setDate(since.getDate() - range);
  } else {
    since.setMonth(since.getMonth() - range);
  }

  const dateFormat = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';

  const results = await Email.aggregate<{ _id: string; total: number; unread: number }>([
    { $match: { emailAccount: { $in: accountIds }, receivedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$receivedAt' } },
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return results.map((r) => ({ date: r._id, total: r.total, unread: r.unread }));
}

export interface TopSender {
  from: string;
  count: number;
  lastReceivedAt: Date;
}

export async function getTopSenders(userId: string, limit: number): Promise<TopSender[]> {
  const accountIds = await getAccountIds(userId);

  const results = await Email.aggregate<{ _id: string; count: number; lastReceivedAt: Date }>([
    { $match: { emailAccount: { $in: accountIds } } },
    { $group: { _id: '$from', count: { $sum: 1 }, lastReceivedAt: { $max: '$receivedAt' } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return results.map((r) => ({ from: r._id, count: r.count, lastReceivedAt: r.lastReceivedAt }));
}
