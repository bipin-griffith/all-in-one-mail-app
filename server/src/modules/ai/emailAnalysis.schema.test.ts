import { emailAnalysisResponseSchema } from './emailAnalysis.schema';

describe('emailAnalysisResponseSchema', () => {
  it('accepts a well-formed OpenAI response', () => {
    const result = emailAnalysisResponseSchema.parse({
      summary: 'Your package has shipped.',
      category: 'shopping',
      priority: 'low',
      action: 'ignore',
    });

    expect(result).toEqual({
      summary: 'Your package has shipped.',
      category: 'shopping',
      priority: 'low',
      action: 'ignore',
    });
  });

  it('falls back field-by-field instead of failing the whole response', () => {
    const result = emailAnalysisResponseSchema.parse({
      summary: 'Interview scheduled for next week.',
      category: 'career', // not in EMAIL_AI_CATEGORIES
      priority: 'urgent', // not in EMAIL_AI_PRIORITIES
      action: 'respond', // not in EMAIL_AI_ACTIONS
    });

    expect(result.summary).toBe('Interview scheduled for next week.');
    expect(result.category).toBe('personal');
    expect(result.priority).toBe('medium');
    expect(result.action).toBe('archive');
  });

  it('falls back on a missing/empty summary', () => {
    const result = emailAnalysisResponseSchema.parse({
      summary: '',
      category: 'jobs',
      priority: 'high',
      action: 'reply',
    });

    expect(result.summary).toBe('Unable to generate a summary for this email.');
    expect(result.category).toBe('jobs');
  });
});
