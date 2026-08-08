/**
 * Jest can't load the real `sanitize-html` — as of 2.17.5+ it pulls in
 * `htmlparser2` (and its own dom* dependencies), which ship as pure ESM
 * with no CommonJS build. Jest 29's runtime can't `require()` that (Node
 * itself can, via its newer require-of-ESM interop, but jest-runtime
 * doesn't implement that) — confirmed by running `node -e
 * "require('sanitize-html')"` directly, which works fine, so this is a
 * Jest-only limitation, not a production one.
 *
 * Rather than pull in a Babel toolchain solely to transform a third-party
 * ESM subtree, this mock stands in for it in tests via jest.config.js's
 * `moduleNameMapper`. It only needs to satisfy what our own code
 * (`gmail.mapper.ts`, `textExtraction.service.ts`) actually does with the
 * module — strip `<script>`/`<style>` blocks and expose
 * `.defaults.allowedTags` — not replicate sanitize-html's full
 * tag/attribute allowlist engine, since that library's own correctness is
 * its maintainers' responsibility, not something this project's test suite
 * re-verifies. Note real sanitize-html's default allowlist (copied below,
 * verified via `node -e "require('sanitize-html').defaults.allowedTags"`)
 * already excludes both script and style — both call sites' `.filter(tag
 * => tag !== 'script' / ...)` are no-ops against the real defaults too, so
 * this mock stripping them unconditionally matches real behavior exactly.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

sanitizeHtml.defaults = {
  allowedTags: [
    'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hgroup', 'main', 'nav', 'section', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption',
    'figure', 'hr', 'li', 'menu', 'ol', 'p', 'pre', 'ul', 'a', 'abbr', 'b', 'bdi', 'bdo', 'br',
    'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby',
    's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'caption',
    'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  ],
};

export default sanitizeHtml;
