import { useState, type FormEvent } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatMessage, type ChatTurn } from '@/features/chat/components/ChatMessage';
import { useChat } from '@/features/chat/hooks/useChat';

const EXAMPLE_QUESTIONS = [
  'Who rejected me?',
  'Show Amazon invoices',
  'Find interview invitations',
  'What subscriptions do I have?',
  'Summarize all Microsoft emails',
  'How many companies replied this month?',
];

/**
 * Stateless per-request on the server (docs/RAG_AND_DASHBOARDS.md §8) —
 * conversation history here is purely local UI state, not synced/persisted.
 */
export default function ChatPage() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const chat = useChat();

  async function ask(question: string): Promise<void> {
    const id = crypto.randomUUID();
    setTurns((prev) => [...prev, { id, question, isPending: true }]);
    setInput('');

    try {
      const result = await chat.mutateAsync(question);
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isPending: false, answer: result.answer, sources: result.sources } : t)),
      );
    } catch {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, isPending: false, error: 'Something went wrong. Try again.' } : t,
        ),
      );
    }
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (input.trim()) void ask(input.trim());
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col p-6">
        <h1 className="mb-4 text-xl font-semibold">Ask your inbox</h1>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <Button key={q} size="sm" variant="outline" onClick={() => void ask(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <ChatMessage key={turn.id} turn={turn} />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2 border-t pt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your email…"
            disabled={chat.isPending}
          />
          <Button type="submit" disabled={chat.isPending || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
