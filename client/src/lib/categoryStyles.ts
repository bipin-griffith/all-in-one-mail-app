import type { EmailAiCategory, EmailAiPriority } from '@/features/email/api/email.api';

/** Color-coding for AI-assigned categories, shared by inbox badges and dashboard cards. */
export const CATEGORY_STYLES: Record<EmailAiCategory, string> = {
  jobs: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  shopping: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  finance: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  bills: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  marketing: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  personal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  government: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  travel: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  university: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  spam: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

export function categoryStyle(category: string | null | undefined): string {
  if (!category) return 'bg-secondary text-secondary-foreground';
  return CATEGORY_STYLES[category as EmailAiCategory] ?? 'bg-secondary text-secondary-foreground';
}

export const PRIORITY_DOT: Record<EmailAiPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};
