import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTimeseriesStats } from '../hooks/useTimeseriesStats';
import { TimeseriesChart } from './TimeseriesChart';

/**
 * Backs both Daily Statistics and Monthly Statistics — one component
 * parameterized by `granularity`/`range`/`title`, not two separate ones.
 */
export function TimeseriesStatsCard({
  title,
  granularity,
  range,
}: {
  title: string;
  granularity: 'day' | 'month';
  range: number;
}) {
  const { data, isLoading } = useTimeseriesStats(granularity, range);

  const total = data?.reduce((sum, bucket) => sum + bucket.total, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{total} emails total</p>
            <TimeseriesChart data={data.map((bucket) => ({ label: bucket.date, value: bucket.total }))} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
