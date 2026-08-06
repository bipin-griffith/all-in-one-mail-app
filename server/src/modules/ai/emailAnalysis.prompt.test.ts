import { buildEmailAnalysisPrompt } from './emailAnalysis.prompt';

describe('buildEmailAnalysisPrompt', () => {
  it('lists every allowed category, priority, and action in the system prompt', () => {
    const { system } = buildEmailAnalysisPrompt({ subject: 'Hi', from: 'a@b.com', bodyText: 'Body' });

    for (const word of ['jobs', 'shopping', 'finance', 'bills', 'marketing', 'spam']) {
      expect(system).toContain(word);
    }
    for (const word of ['high', 'medium', 'low']) {
      expect(system).toContain(word);
    }
    for (const word of ['reply', 'ignore', 'archive', 'reminder', 'follow_up']) {
      expect(system).toContain(word);
    }
  });

  it('includes subject, sender, and body in the user prompt', () => {
    const { user } = buildEmailAnalysisPrompt({
      subject: 'Invoice due',
      from: 'billing@example.com',
      bodyText: 'Your invoice is attached.',
    });

    expect(user).toContain('Invoice due');
    expect(user).toContain('billing@example.com');
    expect(user).toContain('Your invoice is attached.');
  });

  it('truncates a long body instead of sending it in full, to bound token usage', () => {
    const longBody = 'x'.repeat(10_000);
    const { user } = buildEmailAnalysisPrompt({ subject: 'Long', from: 'a@b.com', bodyText: longBody });

    expect(user.length).toBeLessThan(longBody.length);
    expect(user).toContain('…');
  });

  it('does not truncate a short body', () => {
    const { user } = buildEmailAnalysisPrompt({ subject: 'Short', from: 'a@b.com', bodyText: 'hello' });
    expect(user).not.toContain('…');
  });
});
