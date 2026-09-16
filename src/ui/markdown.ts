// Renders a task's metadata block (multi-line markdown) into safe HTML for the hover card.
// Aligns with brainstorm §6.1: markdown is *semantic content*, not viewer-chosen styling — the
// source stays plain text, the viewer derives the emphasis.
//
// Supported (what snarkdown emits): paragraphs, **bold**, *italic*, `code`, [links](url),
// headings, `-`/`1.` lists, fenced code, and `<br>` line breaks. Not supported: nested lists
// and tables (snarkdown limitation), and `>` blockquotes (the escape-first step below turns a
// leading `>` into `&gt;`). Revisit with a full GFM parser + DOM sanitizer if those are needed.
//
// Security: snarkdown passes raw HTML and disallowed URL schemes straight through, so we
// (1) escape the input first — neutralizing any injected tags and attribute-quote breakouts
// before snarkdown builds its own markup — and (2) sanitize the output against a tag whitelist,
// dropping every attribute except a scheme-checked href. Escape-first is what makes the output
// non-adversarial, so the whitelist pass is sufficient without a full DOM sanitizer.

import snarkdown from 'snarkdown';

const ALLOWED_TAGS = new Set([
  // inline
  'strong', 'em', 'code', 'a', 'br',
  // block (multi-line content)
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre',
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only http(s) and mailto links may keep their href; everything else (javascript:, data:, …) is dropped. */
function isSafeUrl(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

/**
 * Whitelist the snarkdown output. Because the input was escaped first, the only tags present
 * are snarkdown's own — so a regex pass is safe here: strip any non-whitelisted tag (keeping its
 * inner text), strip all attributes, and keep only a validated href on `<a>`.
 */
function sanitize(html: string): string {
  return html.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)\/?>/g,
    (_m, slash: string, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return '';
      if (t === 'br') return '<br>';
      if (t === 'a') {
        if (slash) return '</a>';
        const href = /\bhref="([^"]*)"/i.exec(attrs)?.[1] ?? '';
        return isSafeUrl(href)
          ? `<a href="${href}" target="_blank" rel="noopener noreferrer">`
          : '<a>';
      }
      return `<${slash}${t}>`;
    },
  );
}

/** Render a metadata block's markdown to sanitized HTML for use with Svelte's {@html}. */
export function renderMetadataMarkdown(raw: string): string {
  if (!raw) return '';
  // A literal `<br>` in the source becomes a real newline so snarkdown treats it as a line
  // break (rather than escaping it to visible text).
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n');
  // snarkdown wraps block constructs (headings, lists, code) in their own tags but leaves a
  // single newline literal — render those remaining newlines as soft line breaks.
  return sanitize(snarkdown(escapeHtml(withBreaks))).replace(/\n/g, '<br>');
}
