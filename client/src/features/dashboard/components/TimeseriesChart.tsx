/**
 * Small, dependency-free inline-SVG bar chart. Deliberately not built on a
 * charting library (Recharts, Chart.js, etc.) — for eight simple dashboard
 * widgets showing counts over time, a charting library's bundle weight
 * (often 50-100KB+) isn't justified. See docs/RAG_AND_DASHBOARDS.md §10.
 *
 * Generic on purpose: takes plain `{ label, value }` points, not
 * email-specific fields, so it isn't coupled to the timeseries dashboard
 * and could back any other simple count-over-time widget later.
 */
export interface ChartPoint {
  label: string;
  value: number;
}

const CHART_HEIGHT = 120;
const BAR_GAP = 4;

export function TimeseriesChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this period yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-32 w-full text-primary"
        role="img"
        aria-label="Email volume over time"
      >
        {data.map((point, i) => {
          const barHeight = (point.value / max) * (CHART_HEIGHT - 12);
          return (
            <rect
              key={point.label}
              x={i * barWidth + BAR_GAP / 2}
              y={CHART_HEIGHT - barHeight}
              width={Math.max(barWidth - BAR_GAP, 1)}
              height={barHeight}
              fill="currentColor"
              opacity={0.85}
              rx={1}
            >
              <title>
                {point.label}: {point.value}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
