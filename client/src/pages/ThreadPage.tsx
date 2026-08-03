import { useParams } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { AiActionsPanel } from '@/features/ai/components/AiActionsPanel';
import { useThread } from '@/features/email/hooks/useThread';

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useThread(id);

  if (isLoading || !data) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-muted-foreground">Loading thread…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="mb-4 text-xl font-semibold">{data.thread.subject || '(no subject)'}</h1>

          <div className="space-y-4">
            {data.emails.map((email) => (
              <article key={email._id} className="rounded-md border p-4">
                <header className="mb-2 flex items-baseline justify-between text-sm text-muted-foreground">
                  <span>{email.from}</span>
                  <time>{new Date(email.receivedAt).toLocaleString()}</time>
                </header>
                {/* bodyHtml is sanitized server-side before storage - see server email.service.ts */}
                <div dangerouslySetInnerHTML={{ __html: email.bodyHtml || email.bodyText }} />
              </article>
            ))}
          </div>
        </div>

        <div>
          <AiActionsPanel threadId={data.thread._id} />
        </div>
      </div>
    </AppShell>
  );
}
