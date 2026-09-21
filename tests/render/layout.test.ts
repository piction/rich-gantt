import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '../../src/parser';
import { computeSchedule } from '../../src/compute/scheduler';
import { computeLayout } from '../../src/render/layout';

const sample = readFileSync('public/sample-plan.md', 'utf8');

function layout(zoom: 'month' | 'week' | 'day') {
  const r = parseDocument(sample);
  if (!r.ok) throw new Error('parse failed');
  return computeLayout(r.doc, computeSchedule(r.doc), zoom);
}

describe('computeLayout', () => {
  it('produces one bar per task; packed after-chains become chevron junctions', () => {
    const l = layout('day');
    expect(l.bars.length).toBe(9);
    // sample after-edges: dev1,dev2←arch1; arch2←dev1; dev3,dev4←arch2; arch3←dev3; dev5,dev6←arch3.
    // The three linear heads (dev1←arch1, dev3←arch2, dev5←arch3) pack onto their
    // predecessor's row → chevron junctions; the other five stay as elbow arrows.
    expect(l.arrows.length).toBe(5);
    expect(l.junctions.map((j) => j.toId).sort()).toEqual(['dev1', 'dev3', 'dev5']);
    expect(l.sections.length).toBe(3);
  });

  it('packs a linear after-chain onto one row and starts a new row otherwise', () => {
    const l = layout('week');
    const at = (id: string) => l.barsById.get(id)!;
    // arch1 → dev1 is a linear chain: same row (shared y), dev1 to the right of arch1.
    expect(at('dev1').y).toBe(at('arch1').y);
    expect(at('dev1').packedAfter).toBe('arch1');
    expect(at('dev1').x).toBeGreaterThanOrEqual(at('arch1').x + at('arch1').w - 0.5);
    // dev2 also depends on arch1 but arch1's row is taken → dev2 drops to a new row.
    expect(at('dev2').y).toBeGreaterThan(at('arch1').y);
    expect(at('dev2').packedAfter).toBeUndefined();
  });

  it('positions bars in non-decreasing y within the canvas height', () => {
    const l = layout('week');
    const ys = l.bars.map((b) => b.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
    expect(Math.max(...ys)).toBeLessThan(l.height);
    expect(l.width).toBeGreaterThan(0);
  });

  it('omits weekend shading at month zoom', () => {
    expect(layout('month').weekends.length).toBe(0);
    expect(layout('day').weekends.length).toBeGreaterThan(0);
  });

  it('computes section duration (span) and total work (summed task days)', () => {
    // Two overlapping tasks: work sums to 6d, but the span is only 5d (first start →
    // last end), and the dates bracket that span (end is the inclusive last day touched).
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    A :a1, 2026-01-01, 2d',
      '    B :b1, 2026-01-02, 4d',
      '```',
    ].join('\n');
    const r = parseDocument(src);
    if (!r.ok) throw new Error('parse failed');
    const l = computeLayout(r.doc, computeSchedule(r.doc), 'day');
    const s = l.sections[0];
    expect(s.hasTasks).toBe(true);
    expect(s.totalWorkDays).toBe(6); // 2 + 4
    expect(s.durationDays).toBe(5); // 2026-01-01 → 2026-01-06 (exclusive end)
    expect(s.startDate).toBe('2026-01-01');
    expect(s.endDate).toBe('2026-01-05'); // inclusive last day B touches
  });

  it('routes an arrow from the predecessor top when the successor is above it', () => {
    // Successor Y is declared before its predecessor X, so Y's bar sits above X's.
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    Y :y1, after x1, 2d',
      '    X :x1, 2026-01-01, 2d',
      '```',
    ].join('\n');
    const r = parseDocument(src);
    if (!r.ok) throw new Error('parse failed');
    const l = computeLayout(r.doc, computeSchedule(r.doc), 'day');
    const from = l.barsById.get('x1')!;
    const arrow = l.arrows.find((a) => a.from === 'x1' && a.to === 'y1')!;
    // Path must start at the predecessor's center-top (not center-bottom) so it clears the bar.
    expect(arrow.d.startsWith(`M ${from.x + from.w / 2},${from.y} `)).toBe(true);
  });
});
