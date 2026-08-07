import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmailAiCategory } from '@/features/email/api/email.api';

import { useCategoryDashboard } from '../hooks/useCategoryDashboard';

const CATEGORY_LABELS: Record<EmailAiCategory, string> = {
  jobs: 'Jobs',
  shopping: 'Shopping',
  finance: 'Finance',
  bills: 'Bills',
  marketing: 'Marketing',
  personal: 'Personal',
  government: 'Government',
  travel: 'Travel',
  university: 'University',
  spam: 'Spam',
};

/**
 * One component, instantiated with a different `category` prop for the
 * Jobs/Shopping/Finance dashboards (and reusable for any of the other seven
 * AI categories) — not three near-identical components. Mirrors the
 * backend's single parameterized `GET /dashboard/category/:aiCategory`
 * endpoint. See docs/RAG_AND_DASHBOARDS.md §9.
 */
export function CategoryDashboardCard({ category }: { category: EmailAiCategory }) {
  const { data, isLoading } = useCategoryDashboard(category);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CATEGORY_LABELS[category]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{data.total}</span>
              <span className="text-sm text-muted-foreground">emails</span>
            </div>

            {Object.keys(data.byPriority).length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(data.byPriority).map(([priority, count]) => (
                  <span key={priority} className="rounded-full bg-secondary px-2 py-0.5">
                    {priority}: {count}
                  </span>
                ))}
              </div>
            )}

            <ul className="divide-y">
              {data.recent.slice(0, 5).map((email) => (
                <li key={email.id} className="py-2 text-sm">
                  <p className="truncate font-medium">{email.subject || '(no subject)'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {email.aiSummary ?? email.from}
                  </p>
                </li>
              ))}
              {data.recent.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Nothing here yet.</li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
