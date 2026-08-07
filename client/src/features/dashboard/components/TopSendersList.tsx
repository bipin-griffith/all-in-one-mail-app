import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTopSenders } from '../hooks/useTopSenders';

export function TopSendersList({ limit = 10 }: { limit?: number }) {
  const { data, isLoading } = useTopSenders(limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Senders</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        <ol className="divide-y">
          {data?.map((sender, i) => (
            <li key={sender.from} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                <span className="truncate">{sender.from}</span>
              </span>
              <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs">
                {sender.count}
              </span>
            </li>
          ))}
          {data && data.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">No emails synced yet.</li>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}
