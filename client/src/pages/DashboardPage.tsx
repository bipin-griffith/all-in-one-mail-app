import { AppShell } from '@/components/layout/AppShell';
import { CategoryDashboardCard } from '@/features/dashboard/components/CategoryDashboardCard';
import { EmailFilterList } from '@/features/dashboard/components/EmailFilterList';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { TimeseriesStatsCard } from '@/features/dashboard/components/TimeseriesStatsCard';
import { TopSendersList } from '@/features/dashboard/components/TopSendersList';
import { useEmails } from '@/features/email/hooks/useEmails';

export default function DashboardPage() {
  const unread = useEmails({ isRead: false, limit: 1 });
  const highPriority = useEmails({ aiPriority: 'high', limit: 1 });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Unread" value={unread.data?.total ?? '—'} tone="warning" />
          <StatCard label="High priority" value={highPriority.data?.total ?? '—'} tone="danger" />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            By category
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <CategoryDashboardCard category="jobs" />
            <CategoryDashboardCard category="shopping" />
            <CategoryDashboardCard category="finance" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Volume over time
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TimeseriesStatsCard title="Daily Statistics" granularity="day" range={30} />
            <TimeseriesStatsCard title="Monthly Statistics" granularity="month" range={12} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Focus lists
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TopSendersList limit={10} />
            <EmailFilterList title="Unread Emails" filters={{ isRead: false }} />
            <EmailFilterList title="Priority Emails" filters={{ aiPriority: 'high' }} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
