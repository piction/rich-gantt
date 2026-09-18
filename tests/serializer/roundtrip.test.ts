import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '../../src/parser';
import { serializeDocument } from '../../src/serializer';
import type { ParsedDocument } from '../../src/model/types';

const sample = readFileSync('public/sample-plan.md', 'utf8');

/** Compare documents ignoring sourceLine (which shifts under reformatting). */
function normalize(doc: ParsedDocument) {
  return {
    title: doc.title,
    dateFormat: doc.dateFormat,
    excludeWeekends: doc.excludeWeekends,
    sections: doc.sections,
    order: doc.order,
    tasks: [...doc.tasks.values()].map(({ sourceLine, ...rest }) => rest),
  };
}

describe('serializer round-trip', () => {
  it('parse → serialize → parse preserves the model', () => {
    const first = parseDocument(sample);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const text = serializeDocument(first.doc);
    const second = parseDocument(text);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(normalize(second.doc)).toEqual(normalize(first.doc));
  });

  it('serialize is idempotent (byte-stable through a re-parse)', () => {
    const parsed = parseDocument(sample);
    if (!parsed.ok) throw new Error('parse failed');
    const once = serializeDocument(parsed.doc);

    const reparsed = parseDocument(once);
    if (!reparsed.ok) throw new Error('re-parse failed');
    const twice = serializeDocument(reparsed.doc);

    expect(twice).toBe(once);
  });

  it('preserves the `excludes weekends` directive through a round-trip', () => {
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    excludes weekends',
      '    section S',
      '    A :a, 2026-01-01, 2d',
      '```',
    ].join('\n');
    const r = parseDocument(src);
    if (!r.ok) throw new Error('parse failed');
    expect(r.doc.excludeWeekends).toBe(true);
    const text = serializeDocument(r.doc);
    expect(text).toContain('excludes weekends');
    const again = parseDocument(text);
    if (!again.ok) throw new Error('re-parse failed');
    expect(again.doc.excludeWeekends).toBe(true);
  });

  it('output re-parses cleanly with no errors', () => {
    const parsed = parseDocument(sample);
    if (!parsed.ok) throw new Error('parse failed');
    const text = serializeDocument(parsed.doc);
    const r = parseDocument(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
});
