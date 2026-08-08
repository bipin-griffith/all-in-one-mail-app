import { isAxiosError } from 'axios';
import { Loader2, PenLine, Sparkles, Tags } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { enqueueClassify, enqueueDraftReply, enqueueSummarize } from '../api/ai.api';
import { useAiJob } from '../hooks/useAiJob';

/**
 * Fires an AI job (summarize/draft-reply/classify) for the current thread and
 * polls it to completion via useAiJob. Mirrors the async job pattern used by
 * every AI operation — see docs/ARCHITECTURE.md.
 */
export function AiActionsPanel({ threadId }: { threadId: string }) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const { data: job, isFetching } = useAiJob(activeJobId);

  async function trigger(fn: (id: string) => Promise<{ jobId: string }>): Promise<void> {
    setEnqueueError(null);
    try {
      const { jobId } = await fn(threadId);
      setActiveJobId(jobId);
    } catch (err) {
      setEnqueueError(
        isAxiosError(err) && err.response?.status === 429
          ? 'Too many requests — wait a moment and try again.'
          : 'Could not start this action. Please try again.',
      );
    }
  }

  const isBusy = isFetching && job?.status !== 'completed' && job?.status !== 'failed';

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isBusy} onClick={() => void trigger(enqueueSummarize)}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Summarize
          </Button>
          <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => void trigger(enqueueDraftReply)}>
            <PenLine className="mr-1.5 h-3.5 w-3.5" />
            Draft reply
          </Button>
          <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void trigger(enqueueClassify)}>
            <Tags className="mr-1.5 h-3.5 w-3.5" />
            Classify
          </Button>
        </div>

        {enqueueError && <p className="text-sm text-destructive">{enqueueError}</p>}

        {activeJobId && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {job?.status === 'completed' && (
              <p className="whitespace-pre-wrap">
                {job.result?.summary ?? job.result?.draft ?? job.result?.category}
              </p>
            )}
            {job?.status === 'failed' && <p className="text-destructive">Failed: {job.error}</p>}
            {(job?.status === 'queued' || job?.status === 'processing' || isFetching) &&
              job?.status !== 'completed' &&
              job?.status !== 'failed' && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Working…
                </p>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
