import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Generic metric tile — the smallest reusable unit dashboards are built
 * from. One component, used for every single-number stat across every
 * dashboard, rather than a bespoke tile per widget.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card className="relative overflow-hidden">
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          tone === 'warning' && 'bg-amber-500',
          tone === 'danger' && 'bg-destructive',
          tone === 'default' && 'brand-gradient',
        )}
      />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-3xl font-semibold tracking-tight',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
