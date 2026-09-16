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
  it('produces one bar per task and one arrow per dependency edge', () => {
    const l = layout('day');
    expect(l.bars.length).toBe(9);
    // sample after-edges: dev1,dev2←arch1; arch2←dev1; dev3,dev4←arch2; arch3←dev3; dev5,dev6←arch3
    expect(l.arrows.length).toBe(8);
    expect(l.sections.length).toBe(3);
  });

  it('positions bars in increasing y and within the canvas height', () => {
    const l = layout('week');
    const ys = l.bars.map((b) => b.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    expect(Math.max(...ys)).toBeLessThan(l.height);
    expect(l.width).toBeGreaterThan(0);
  });

  it('omits weekend shading at month zoom', () => {
    expect(layout('month').weekends.length).toBe(0);
    expect(layout('day').weekends.length).toBeGreaterThan(0);
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
