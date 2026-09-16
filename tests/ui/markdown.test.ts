import { describe, it, expect } from 'vitest';
import { renderMetadataMarkdown } from '../../src/ui/markdown';

describe('renderMetadataMarkdown', () => {
  it('renders bold, italic and inline code', () => {
    expect(renderMetadataMarkdown('**b** *i* `c`')).toBe(
      '<strong>b</strong> <em>i</em> <code>c</code>',
    );
  });

  it('renders safe links with target/rel and no others', () => {
    const out = renderMetadataMarkdown('[docs](https://example.com/a?x=1&y=2)');
    expect(out).toBe(
      '<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it('drops the href of unsafe URL schemes but keeps the text', () => {
    const out = renderMetadataMarkdown('[x](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<a>x</a>');
  });

  it('escapes raw HTML so injected markup cannot execute', () => {
    const out = renderMetadataMarkdown('<img src=x onerror=alert(1)> <script>alert(2)</script>');
    // No live tags survive — the markup is neutralized to inert, entity-escaped text.
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('supports <br> line breaks and bullet lists', () => {
    expect(renderMetadataMarkdown('a<br>b')).toBe('a<br>b');
    expect(renderMetadataMarkdown('steps:<br>- one<br>- two')).toBe(
      'steps:<ul><li>one</li><li>two</li></ul>',
    );
  });

  it('returns empty string for empty input', () => {
    expect(renderMetadataMarkdown('')).toBe('');
  });

  describe('multi-line blocks', () => {
    it('separates paragraphs with a line break', () => {
      expect(renderMetadataMarkdown('First.\n\nSecond.')).toBe('First.<br>Second.');
    });

    it('keeps headings', () => {
      expect(renderMetadataMarkdown('### Title\n\nbody text')).toBe(
        '<h3>Title</h3>body text',
      );
    });

    it('renders a real (newline-separated) list after text', () => {
      expect(renderMetadataMarkdown('Tests for:\n\n- one\n- two\n\nDone.')).toBe(
        'Tests for:<br><ul><li>one</li><li>two</li></ul><br>Done.',
      );
    });

    it('keeps fenced code, stripping attributes', () => {
      expect(renderMetadataMarkdown('```\ncode\n```\n\ntext')).toBe(
        '<pre><code>code</code></pre><br>text',
      );
    });
  });
});
