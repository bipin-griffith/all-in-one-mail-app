import { Loader2, Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

import type { ChatSource } from '../api/chat.api';

export interface ChatTurn {
  id: string;
  question: string;
  answer?: string;
  sources?: ChatSource[];
  error?: string;
  isPending?: boolean;
}

export function ChatMessage({ turn }: { turn: ChatTurn }) {
  return (
    <div className="space-y-3">
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
        {turn.question}
      </div>

      <div className="flex max-w-[85%] items-start gap-2.5">
        <span className="brand-gradient mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white">
          <Sparkles className="h-3 w-3" />
        </span>

        <div className="min-w-0 flex-1">
          {turn.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </p>
          )}
          {turn.error && <p className="text-sm text-destructive">{turn.error}</p>}

          {turn.answer && (
            <Card className="shadow-sm">
              <CardContent className="space-y-3 p-3 text-sm">
                <p className="whitespace-pre-wrap">{turn.answer}</p>

                {turn.sources && turn.sources.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Sources</p>
                    <ul className="space-y-1">
                      {turn.sources.map((source) => (
                        <li key={source.emailId} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {source.subject || '(no subject)'}
                          </span>{' '}
                          — {source.from} · {new Date(source.receivedAt).toLocaleDateString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
