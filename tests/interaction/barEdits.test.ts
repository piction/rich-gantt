import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/parser';
import { computeSchedule } from '../../src/compute/scheduler';
import {
  setDuration,
  addDependency,
  canAddDependency,
} from '../../src/interaction/barEdits';
import type { ParsedDocument } from '../../src/model/types';

function makeDoc(): ParsedDocument {
  const src = [
    '```mermaid',
    'gantt',
    '    dateFormat YYYY-MM-DD',
    '    section S',
    '    A :a, 2026-01-01, 2d',
    '    B :b, after a, 2d',
    '    C :c, after b, 1d',
    '    D :d, 2026-03-01, 1d',
    '```',
  ].join('\n');
  const r = parseDocument(src);
  if (!r.ok) throw new Error('parse failed');
  return r.doc;
}

describe('setDuration (end-edge drag)', () => {
  it('changes duration (snapped to 0.5), keeps position, cascades successors', () => {
    const doc = makeDoc();
    const next = setDuration(doc, 'a', 4.2);
    expect(next.tasks.get('a')!.duration).toBe(4); // snapped
    expect(next.tasks.get('a')!.position).toEqual({
      kind: 'absolute',
      date: '2026-01-01',
    }); // unchanged
    const s = computeSchedule(next);
    expect(s.tasks.get('b')!.start).toBe('2026-01-05'); // a now ends later
  });

  it('enforces a 0.5d minimum', () => {
    const doc = makeDoc();
    expect(setDuration(doc, 'a', 0).tasks.get('a')!.duration).toBe(0.5);
    expect(setDuration(doc, 'a', 0.5).tasks.get('a')!.duration).toBe(0.5);
  });
});

describe('addDependency (dot-connector drop)', () => {
  it('converts an absolute task to `after`, dropping its date; successor cascades', () => {
    const doc = makeDoc();
    // D is an independent anchor; make it depend on C (end of the a→b→c chain).
    const next = addDependency(doc, 'c', 'd');
    expect(next.tasks.get('d')!.position).toEqual({ kind: 'after', ids: ['c'] });
    const s = computeSchedule(next);
    // D's absolute 2026-03-01 date is dropped; it now starts at C's end.
    expect(s.tasks.get('d')!.startDay).toBe(s.tasks.get('c')!.endDay);
  });

  it('accumulates fan-in on a task that is already `after`', () => {
    const doc = makeDoc();
    // Give C a second anchor: add an absolute task D, then C after A and D.
    const withDep = addDependency(doc, 'a', 'c'); // c already after b → now after b, a
    expect(withDep.tasks.get('c')!.position).toEqual({ kind: 'after', ids: ['b', 'a'] });
  });

  it('rejects self-links, duplicates, and cycles (no-op)', () => {
    const doc = makeDoc();
    expect(addDependency(doc, 'a', 'a')).toBe(doc); // self
    expect(canAddDependency(doc, 'a', 'a')).toBe(false);
    expect(addDependency(doc, 'b', 'c')).toBe(doc); // c already after b → duplicate
    expect(canAddDependency(doc, 'b', 'c')).toBe(false);
    // c depends on b depends on a; a→? adding a after c would cycle (a→c→b→a).
    expect(canAddDependency(doc, 'c', 'b')).toBe(false);
    expect(addDependency(doc, 'c', 'b')).toBe(doc);
  });
});
