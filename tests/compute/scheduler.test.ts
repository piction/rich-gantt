import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '../../src/parser';
import { computeSchedule } from '../../src/compute/scheduler';
import { toEpochDay } from '../../src/compute/dateMath';

const sample = readFileSync('public/sample-plan.md', 'utf8');

function schedule(src: string) {
  const r = parseDocument(src);
  if (!r.ok) throw new Error('parse failed: ' + r.errors.map((e) => e.code).join(','));
  return computeSchedule(r.doc);
}

describe('golden schedule (sample-plan.md)', () => {
  const s = schedule(sample);
  const start = (id: string) => s.tasks.get(id)!.start;
  const end = (id: string) => s.tasks.get(id)!.end;

  it('anchors the absolute-start task', () => {
    expect(start('arch1')).toBe('2026-09-14');
    expect(end('arch1')).toBe('2026-09-16'); // 3d, inclusive finish
  });

  it('chains after-dependencies from predecessor end', () => {
    // arch1 ends (exclusive) 2026-09-17 → dev1 starts there.
    expect(start('dev1')).toBe('2026-09-17');
    expect(end('dev1')).toBe('2026-09-21'); // 5d
    // dev1 ends (exclusive) 2026-09-22 → arch2 starts there.
    expect(start('arch2')).toBe('2026-09-22');
  });

  it('parallel siblings share a start', () => {
    // dev1 and dev2 both `after arch1`.
    expect(start('dev1')).toBe(start('dev2'));
  });
});

describe('fan-in resolves to the latest predecessor end', () => {
  it('C after A B starts at max(endA, endB)', () => {
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    A :a, 2026-01-01, 2d',
      '    B :b, 2026-01-01, 3d',
      '    C :c, after a b, 1d',
      '```',
    ].join('\n');
    const s = schedule(src);
    // A endDay = +2, B endDay = +3 → C starts at B's end = 2026-01-04.
    expect(s.tasks.get('c')!.startDay).toBe(toEpochDay('2026-01-04'));
    expect(s.tasks.get('c')!.start).toBe('2026-01-04');
  });
});

describe('working-day scheduling (weekends excluded)', () => {
  const src = [
    '```mermaid',
    'gantt',
    '    dateFormat YYYY-MM-DD',
    '    section S',
    '    A :a, 2026-09-17, 5d', // Thursday
    '    B :b, after a, 2d',
    '```',
  ].join('\n');

  it('lays a duration over work days only, spanning weekends', () => {
    const r = parseDocument(src);
    if (!r.ok) throw new Error('parse failed');
    const s = computeSchedule(r.doc, { excludeWeekends: true });
    // 5 work days from Thu 09-17: Thu,Fri,Mon,Tue,Wed → ends exclusive Thu 09-24.
    expect(s.tasks.get('a')!.endDay).toBe(toEpochDay('2026-09-24'));
    expect(s.tasks.get('a')!.end).toBe('2026-09-23'); // inclusive last work day (Wed)
    // Successor starts on that work day (no weekend to skip here).
    expect(s.tasks.get('b')!.startDay).toBe(toEpochDay('2026-09-24'));
  });

  it('snaps a weekend start forward to Monday', () => {
    const wk = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    A :a, 2026-09-19, 1d', // Saturday
      '```',
    ].join('\n');
    const r = parseDocument(wk);
    if (!r.ok) throw new Error('parse failed');
    const s = computeSchedule(r.doc, { excludeWeekends: true });
    expect(s.tasks.get('a')!.start).toBe('2026-09-21'); // Monday
  });

  it('default (calendar) scheduling still counts weekend days', () => {
    const r = parseDocument(src);
    if (!r.ok) throw new Error('parse failed');
    const s = computeSchedule(r.doc);
    // Plain calendar: 5d from Thu 09-17 ends exclusive 09-22.
    expect(s.tasks.get('a')!.endDay).toBe(toEpochDay('2026-09-22'));
  });
});

describe('half-day durations chain exactly', () => {
  it('0.5d task advances the successor by half a day', () => {
    const src = [
      '```mermaid',
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    A :a, 2026-01-01, 0.5d',
      '    B :b, after a, 1d',
      '```',
    ].join('\n');
    const s = schedule(src);
    expect(s.tasks.get('a')!.endDay).toBe(toEpochDay('2026-01-01') + 0.5);
    expect(s.tasks.get('b')!.startDay).toBe(toEpochDay('2026-01-01') + 0.5);
  });
});
