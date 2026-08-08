import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { AiActionsPanel } from '@/features/ai/components/AiActionsPanel';
import { useThread } from '@/features/email/hooks/useThread';
import { avatarColorFor, displayName, initialsFor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useThread(id);

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div>
          <Link
            to="/inbox"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to inbox
          </Link>

          <h1 className="mb-5 text-xl font-semibold tracking-tight">
            {data.thread.subject || '(no subject)'}
          </h1>

          <div className="space-y-4">
            {data.emails.map((email) => (
              <article key={email._id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <header className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                      avatarColorFor(email.from),
                    )}
                  >
                    {initialsFor(email.from)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayName(email.from)}</p>
                    <p className="truncate text-xs text-muted-foreground">{email.from}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(email.receivedAt).toLocaleString()}
                  </time>
                </header>
                {/* bodyHtml is sanitized server-side before storage - see server email.service.ts */}
                <div
                  className="max-w-none p-4 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: email.bodyHtml || email.bodyText }}
                />
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="lg:sticky lg:top-6">
            <AiActionsPanel threadId={data.thread._id} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
