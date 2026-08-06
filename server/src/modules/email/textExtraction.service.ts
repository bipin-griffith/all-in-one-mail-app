import { convert } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';

/**
 * Steps 1–2 of the AI processing pipeline (docs/AI_PIPELINE.md): turn raw
 * Gmail message content into plain, readable text suitable for prompting an
 * LLM. Kept separate from emailProcessing.service.ts (which owns steps
 * 3–6 — summary/category/priority/action) so the deterministic, free
 * text-handling logic is independently testable without touching OpenAI.
 */

/**
 * Defensive second pass. `bodyHtml` on a stored Email is already sanitized
 * once during Gmail sync (see gmail/gmail.mapper.ts) — this re-sanitizes
 * with an even stricter tag allowlist before HTML-to-text conversion, so
 * this function is safe to call on *any* HTML string, not just ones that
 * already passed through the sync-time sanitizer.
 */
export function cleanHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter((tag) => !['script', 'style'].includes(tag)),
    allowedAttributes: {},
  });
}

/**
 * Prefers the message's plain-text part when Gmail provided one (most
 * messages include both) — it's already exactly what we want, with no
 * conversion needed. Only falls back to converting the HTML part when no
 * plain-text part exists (HTML-only marketing/newsletter emails are the
 * common case here).
 */
export function extractReadableText(bodyHtml: string, bodyText: string): string {
  if (bodyText.trim().length > 0) {
    return bodyText.trim();
  }

  if (!bodyHtml) return '';

  return convert(cleanHtml(bodyHtml), {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }).trim();
}
