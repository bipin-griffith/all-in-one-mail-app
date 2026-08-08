import { ChevronLeft, ChevronRight, Inbox as InboxIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { useThreads } from '@/features/email/hooks/useThreads';
import { avatarColorFor, displayName, initialsFor } from '@/lib/avatar';
import { categoryStyle } from '@/lib/categoryStyles';
import { cn } from '@/lib/utils';

function ThreadRowSkeleton() {
  return (
    <li className="flex items-center gap-4 p-4">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
      </div>
    </li>
  );
}

export default function InboxPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useThreads({ page, limit: 20 });
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          {!!data?.total && (
            <span className="text-sm text-muted-foreground">{data.total} threads</span>
          )}
        </div>

        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}

          {data?.items.map((thread) => {
            const primaryParticipant = thread.participants[0] ?? '?';
            return (
              <li
                key={thread._id}
                onClick={() => navigate(`/threads/${thread._id}`)}
                className="group flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-accent/60"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                    avatarColorFor(primaryParticipant),
                  )}
                >
                  {initialsFor(primaryParticipant)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!thread.isRead && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <p
                      className={cn(
                        'truncate text-sm',
                        thread.isRead ? 'text-foreground/80' : 'font-semibold',
                      )}
                    >
                      {thread.subject || '(no subject)'}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {thread.participants.map(displayName).join(', ')}
                  </p>
                </div>

                {thread.aiCategory && (
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                      categoryStyle(thread.aiCategory),
                    )}
                  >
                    {thread.aiCategory}
                  </span>
                )}

                <time className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {new Date(thread.lastMessageAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </li>
            );
          })}

          {!isLoading && data?.items.length === 0 && (
            <li className="flex flex-col items-center gap-3 p-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <InboxIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">No threads yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Connect a mailbox and hit sync in the sidebar to pull in your email.
              </p>
            </li>
          )}
        </ul>

        {!!data && data.total > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {data?.page ?? page} · {data?.total ?? 0} threads
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || page * data.limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
