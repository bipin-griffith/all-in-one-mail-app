import { deriveCategory, normalizeMessage } from './gmail.mapper';

describe('deriveCategory', () => {
  it('prioritizes drafts over every other label', () => {
    expect(deriveCategory(['DRAFT', 'INBOX', 'CATEGORY_PROMOTIONS'])).toBe('drafts');
  });

  it('prioritizes sent over category labels', () => {
    expect(deriveCategory(['SENT', 'CATEGORY_SOCIAL'])).toBe('sent');
  });

  it('picks promotions when present without drafts/sent', () => {
    expect(deriveCategory(['INBOX', 'CATEGORY_PROMOTIONS'])).toBe('promotions');
  });

  it('picks social when present without drafts/sent/promotions', () => {
    expect(deriveCategory(['INBOX', 'CATEGORY_SOCIAL'])).toBe('social');
  });

  it('falls back to inbox when no special category label is present', () => {
    expect(deriveCategory(['INBOX', 'IMPORTANT'])).toBe('inbox');
  });

  it('falls back to other when nothing recognizable is present', () => {
    expect(deriveCategory(['STARRED'])).toBe('other');
  });
});

describe('normalizeMessage', () => {
  it('extracts headers, body, and attachments from a multipart message', () => {
    const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

    const message = {
      id: 'msg-1',
      threadId: 'thread-1',
      snippet: 'preview',
      internalDate: '1700000000000',
      labelIds: ['INBOX'],
      payload: {
        mimeType: 'multipart/mixed',
        headers: [],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: encode('hello plain') } },
              { mimeType: 'text/html', body: { data: encode('<p>hello html</p>') } },
            ],
          },
          {
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            body: { attachmentId: 'att-1', size: 1234 },
          },
        ],
        headers2: undefined,
      },
    };

    // headers live on payload.headers per the Gmail schema; add them explicitly for this fixture
    (message.payload as { headers: unknown }).headers = [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'a@example.com, b@example.com' },
      { name: 'Subject', value: 'Test subject' },
    ];

    const result = normalizeMessage(message);

    expect(result.providerMessageId).toBe('msg-1');
    expect(result.providerThreadId).toBe('thread-1');
    expect(result.from).toBe('sender@example.com');
    expect(result.to).toEqual(['a@example.com', 'b@example.com']);
    expect(result.subject).toBe('Test subject');
    expect(result.bodyText).toBe('hello plain');
    expect(result.bodyHtml).toContain('hello html');
    expect(result.category).toBe('inbox');
    expect(result.attachments).toEqual([
      { filename: 'report.pdf', mimeType: 'application/pdf', size: 1234, attachmentId: 'att-1' },
    ]);
  });

  it('throws when the message is missing an id or threadId', () => {
    expect(() => normalizeMessage({})).toThrow();
  });
});
