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
    <div className="space-y-2">
      <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {turn.question}
      </div>

      <div className="max-w-[80%]">
        {turn.isPending && <p className="text-sm text-muted-foreground">Thinking…</p>}
        {turn.error && <p className="text-sm text-destructive">{turn.error}</p>}

        {turn.answer && (
          <Card>
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
  );
}
