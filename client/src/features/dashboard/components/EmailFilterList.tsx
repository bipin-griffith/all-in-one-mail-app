import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ListEmailsParams } from '@/features/email/api/email.api';
import { useEmails } from '@/features/email/hooks/useEmails';

/**
 * Backs both the Unread Emails and Priority Emails dashboards — a generic
 * "list of emails matching some filter" view, parameterized by the filter
 * itself rather than being two separate components. See
 * docs/RAG_AND_DASHBOARDS.md §9.
 */
export function EmailFilterList({
  title,
  filters,
}: {
  title: string;
  filters: ListEmailsParams;
}) {
  const { data, isLoading } = useEmails({ limit: 8, ...filters });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}
          {data && <span className="ml-2 text-sm font-normal text-muted-foreground">({data.total})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        <ul className="divide-y">
          {data?.items.map((email) => (
            <li key={email._id} className="py-2 text-sm">
              <p className="truncate font-medium">{email.subject || '(no subject)'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {email.aiSummary ?? email.snippet ?? email.from}
              </p>
            </li>
          ))}
          {data && data.items.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">Nothing here.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
