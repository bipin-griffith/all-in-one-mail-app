import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { useThreads } from '@/features/email/hooks/useThreads';

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useThreads({ page, limit: 20 });
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Inbox</h1>

        {isLoading && <p className="text-sm text-muted-foreground">Loading threads…</p>}

        <ul className="divide-y rounded-md border">
          {data?.items.map((thread) => (
            <li
              key={thread._id}
              onClick={() => navigate(`/threads/${thread._id}`)}
              className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-accent"
            >
              <div className="min-w-0">
                <p className={thread.isRead ? 'truncate text-sm' : 'truncate text-sm font-semibold'}>
                  {thread.subject || '(no subject)'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {thread.participants.join(', ')}
                </p>
              </div>
              {thread.aiCategory && (
                <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {thread.aiCategory}
                </span>
              )}
            </li>
          ))}

          {!isLoading && data?.items.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              No threads yet — connect a mailbox and sync to get started.
            </li>
          )}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data?.page ?? page} · {data?.total ?? 0} threads
          </span>
          <Button
            variant="outline"
            disabled={!data || page * data.limit >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
