import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '../../src/parser';
import type { ParseErrorCode } from '../../src/model/types';

const sample = readFileSync('public/sample-plan.md', 'utf8');

/** Wrap task lines in a minimal valid document shell. `metaBlocks` is raw markdown appended
 *  below the mermaid fence (one or more `## Task metadata: <id>` blocks). */
function doc(taskLines: string, metaBlocks = ''): string {
  return [
    '```mermaid',
    'gantt',
    '    title Test',
    '    dateFormat YYYY-MM-DD',
    '    section S',
    taskLines,
    '```',
    '',
    metaBlocks,
  ].join('\n');
}

function expectError(source: string, code: ParseErrorCode) {
  const r = parseDocument(source);
  expect(r.ok, `expected parse to fail with ${code}`).toBe(false);
  if (!r.ok) {
    expect(r.errors.map((e) => e.code)).toContain(code);
  }
}

describe('valid golden document (sample-plan.md)', () => {
  const r = parseDocument(sample);
  it('parses successfully with no warnings', () => {
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
  it('has 9 tasks across 3 sections', () => {
    if (!r.ok) throw new Error('parse failed');
    expect(r.doc.tasks.size).toBe(9);
    expect(r.doc.sections.map((s) => s.name)).toEqual([
      'Foundation',
      'Core',
      'Integration',
    ]);
  });
  it('joins metadata by id and parses the attr dict + body', () => {
    if (!r.ok) throw new Error('parse failed');
    expect(r.doc.tasks.get('arch1')?.metadata?.attrs.get('owner')).toBe('Jonas');
    expect(r.doc.tasks.get('dev6')?.metadata?.attrs.get('team')).toBe('Frontend');
    // A missing key resolves to undefined (treated as None downstream).
    expect(r.doc.tasks.get('arch1')?.metadata?.attrs.get('status')).toBeUndefined();
    // The whole block (dict bullets included) is kept as body for markdown rendering.
    expect(r.doc.tasks.get('arch1')?.metadata?.body).toContain('- type: architecture');
    expect(r.doc.tasks.get('arch1')?.metadata?.body).toContain('Lock the');
  });
  it('models positions correctly', () => {
    if (!r.ok) throw new Error('parse failed');
    expect(r.doc.tasks.get('arch1')?.position).toEqual({
      kind: 'absolute',
      date: '2026-09-14',
    });
    expect(r.doc.tasks.get('dev1')?.position).toEqual({
      kind: 'after',
      ids: ['arch1'],
    });
  });
});

describe('fan-in position (after A B)', () => {
  it('captures multiple predecessor ids', () => {
    const src = doc(
      [
        '    A :a, 2026-01-01, 2d',
        '    B :b, 2026-01-01, 3d',
        '    C :c, after a b, 1d',
      ].join('\n'),
    );
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.tasks.get('c')?.position).toEqual({
        kind: 'after',
        ids: ['a', 'b'],
      });
    }
  });
});

describe('milestone tag', () => {
  it('is recognized as kind milestone', () => {
    const src = doc('    M :milestone, m, 2026-01-01, 0d');
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.tasks.get('m')?.kind).toBe('milestone');
  });
});

describe('error cases (one per code)', () => {
  it('NO_MERMAID_BLOCK', () => {
    expectError('# just markdown, no fence', 'NO_MERMAID_BLOCK');
  });
  it('MISSING_ID', () => {
    expectError(doc('    Label :, 2026-01-01, 2d'), 'MISSING_ID');
  });
  it('DUPLICATE_ID', () => {
    expectError(
      doc('    A :x, 2026-01-01, 2d\n    B :x, 2026-01-02, 2d'),
      'DUPLICATE_ID',
    );
  });
  it('UNKNOWN_AFTER_TARGET', () => {
    expectError(doc('    A :a, after ghost, 2d'), 'UNKNOWN_AFTER_TARGET');
  });
  it('NEITHER_DATE_NOR_AFTER', () => {
    expectError(doc('    A :a, sometime, 2d'), 'NEITHER_DATE_NOR_AFTER');
  });
  it('INVALID_DURATION_GRANULARITY', () => {
    expectError(doc('    A :a, 2026-01-01, 0.25d'), 'INVALID_DURATION_GRANULARITY');
  });
  it('BAD_DATE_FORMAT', () => {
    expectError(doc('    A :a, 2026-13-40, 2d'), 'BAD_DATE_FORMAT');
  });
  it('MALFORMED_TASK_LINE', () => {
    expectError(doc('    A line with no colon 2d'), 'MALFORMED_TASK_LINE');
  });
  it('UNSUPPORTED_DATE_FORMAT', () => {
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat DD/MM/YYYY',
      '    section S',
      '    A :a, 2026-01-01, 2d',
      '```',
    ].join('\n');
    expectError(src, 'UNSUPPORTED_DATE_FORMAT');
  });
  it('CYCLE_DETECTED', () => {
    expectError(
      doc('    A :a, after b, 2d\n    B :b, after a, 2d'),
      'CYCLE_DETECTED',
    );
  });
  it('DUPLICATE_ID (metadata block)', () => {
    const src = doc(
      '    A :a, 2026-01-01, 2d',
      '## Task metadata: a\n\n- type: dev\n\n## Task metadata: a\n\n- type: arch',
    );
    expectError(src, 'DUPLICATE_ID');
  });
});

describe('non-fatal warnings', () => {
  it('METADATA_ROW_UNKNOWN_ID warns but still parses ok', () => {
    const src = doc(
      '    A :a, 2026-01-01, 2d',
      '## Task metadata: ghost\n\n- type: dev\n\norphan block',
    );
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.map((w) => w.code)).toContain('METADATA_ROW_UNKNOWN_ID');
    }
  });

  it('tolerates a space before the colon in the metadata heading', () => {
    const src = doc('    A :a, 2026-01-01, 2d', '## Task metadata : a\n\n- type: dev');
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.tasks.get('a')?.metadata?.attrs.get('type')).toBe('dev');
  });

  it('task without metadata block is allowed (metadata null)', () => {
    const src = doc('    A :a, 2026-01-01, 2d');
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.tasks.get('a')?.metadata).toBeNull();
  });

  it('keeps a fenced code block whose content has # lines inside the metadata body', () => {
    const body = [
      'Setup:',
      '',
      '```bash',
      '# install deps',
      'npm install',
      '## not a heading',
      '```',
      '',
      'Done.',
    ].join('\n');
    const src = doc('    A :a, 2026-01-01, 2d', `## Task metadata: a\n\n${body}`);
    const r = parseDocument(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const md = r.doc.tasks.get('a')?.metadata?.body ?? '';
      expect(md).toContain('# install deps');
      expect(md).toContain('npm install');
      expect(md).toContain('## not a heading');
      expect(md).toContain('Done.');
    }
  });
});
