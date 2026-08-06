import { cleanHtml, extractReadableText } from './textExtraction.service';

describe('cleanHtml', () => {
  it('strips script and style tags', () => {
    const result = cleanHtml('<p>hello</p><script>alert(1)</script><style>body{}</style>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<style>');
    expect(result).toContain('hello');
  });

  it('returns an empty string for empty input', () => {
    expect(cleanHtml('')).toBe('');
  });
});

describe('extractReadableText', () => {
  it('prefers the plain-text body when one is present', () => {
    const result = extractReadableText('<p>html version</p>', 'plain text version');
    expect(result).toBe('plain text version');
  });

  it('falls back to converting HTML to text when there is no plain-text body', () => {
    const result = extractReadableText('<p>Hello <b>world</b></p>', '');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
    expect(result).not.toContain('<b>');
  });

  it('skips images and drops link URLs when converting HTML', () => {
    const result = extractReadableText(
      '<p>Click <a href="https://example.com">here</a></p><img src="pic.png" alt="pic" />',
      '',
    );
    expect(result).not.toContain('https://example.com');
  });

  it('returns an empty string when both bodies are empty', () => {
    expect(extractReadableText('', '')).toBe('');
  });
});
