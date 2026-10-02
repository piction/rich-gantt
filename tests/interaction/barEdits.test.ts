import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/parser';
import { computeSchedule } from '../../src/compute/scheduler';
import {
  setDuration,
  addDependency,
  canAddDependency,
  moveTask,
  deleteTask,
  newTaskId,
  addTaskAfter,
  addTaskAt,
  updateTask,
  splitMetadataBody,
  keyCatalog,
} from '../../src/interaction/barEdits';
import { serializeDocument } from '../../src/serializer';
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

describe('moveTask (focus-mode move / unlink)', () => {
  it('pins to an absolute date and drops every `after` link', () => {
    const doc = makeDoc();
    const next = moveTask(doc, 'b', '2026-01-10');
    expect(next.tasks.get('b')!.position).toEqual({ kind: 'absolute', date: '2026-01-10' });
    expect(computeSchedule(next).tasks.get('c')!.start).toBe('2026-01-12'); // successor cascades
  });
});

describe('deleteTask', () => {
  it('removes the task everywhere and pins direct successors to their current start', () => {
    const doc = makeDoc();
    const before = computeSchedule(doc);
    const next = deleteTask(doc, 'b', (id) => before.tasks.get(id)!.start);
    expect(next.tasks.has('b')).toBe(false);
    expect(next.order).not.toContain('b');
    expect(next.sections[0].taskIds).not.toContain('b');
    expect(next.tasks.get('c')!.position).toEqual({
      kind: 'absolute',
      date: before.tasks.get('c')!.start,
    });
    expect(next.tasks.get('d')).toBe(doc.tasks.get('d')); // unrelated task untouched
  });
});

describe('newTaskId', () => {
  it('uses the first word of the section, max 5 chars, plus a unique counter', () => {
    const doc = makeDoc();
    expect(newTaskId(doc, 'Foundation work')).toBe('found1');
    expect(newTaskId(doc, 'Q3 & beyond')).toBe('q31');
    expect(newTaskId(doc, '')).toBe('task1');
    const { doc: d2 } = addTaskAfter(doc, 'a', { label: 'X', duration: 1, section: 'Foundation', attrs: [] });
    expect(newTaskId(d2, 'Foundation')).toBe('found2');
  });
});

describe('addTaskAfter', () => {
  it('inserts right below the predecessor in its section, linked `after` it', () => {
    const doc = makeDoc();
    const { doc: next, id } = addTaskAfter(doc, 'a', {
      label: 'New: thing',
      duration: 2.2,
      section: 'S',
      attrs: [],
    });
    expect(id).toBe('s1');
    const t = next.tasks.get(id)!;
    expect(t.position).toEqual({ kind: 'after', ids: ['a'] });
    expect(t.label).toBe('New  thing'); // ':' would break the task line
    expect(t.duration).toBe(2);
    expect(next.sections[0].taskIds).toEqual(['a', id, 'b', 'c', 'd']);
    // survives a serialize → parse round trip
    const r = parseDocument(serializeDocument(next));
    expect(r.ok && r.doc.tasks.get(id)!.position).toEqual({ kind: 'after', ids: ['a'] });
  });
});

describe('addTaskAt', () => {
  it('appends a task pinned to the given start at the end of its section', () => {
    const doc = makeDoc();
    const { doc: next, id } = addTaskAt(doc, '2026-01-05', {
      label: 'Kickoff',
      duration: 3,
      section: 'S',
      attrs: [],
    });
    expect(next.tasks.get(id)!.position).toEqual({ kind: 'absolute', date: '2026-01-05' });
    expect(next.sections[0].taskIds).toEqual(['a', 'b', 'c', 'd', id]);
    const r = parseDocument(serializeDocument(next));
    expect(r.ok && r.doc.tasks.get(id)!.position).toEqual({
      kind: 'absolute',
      date: '2026-01-05',
    });
  });

  it('creates a missing section at the end, holding the new task', () => {
    const { doc: next, id } = addTaskAt(makeDoc(), '2026-01-05', {
      label: '',
      duration: 1,
      section: '  QA  ',
      attrs: [],
    });
    expect(next.sections.map((s) => s.name)).toEqual(['S', 'QA']);
    expect(next.sections[1].taskIds).toEqual([id]);
    const r = parseDocument(serializeDocument(next));
    expect(r.ok && r.doc.sections.map((s) => s.name)).toEqual(['S', 'QA']);
  });
});

describe('updateTask / splitMetadataBody', () => {
  it('splits keys from notes and writes them back, id unchanged', () => {
    const parts = splitMetadataBody('- type: dev\n- owner: Jo\n\nSome **notes**.');
    expect(parts).toEqual({ attrs: [['type', 'dev'], ['owner', 'Jo']], notes: 'Some **notes**.' });
    const next = updateTask(makeDoc(), 'a', {
      label: 'Renamed',
      attrs: [['type', 'arch'], ['', 'dropped'], ['te:am', 'Core']],
      notes: 'Hello',
    });
    const t = next.tasks.get('a')!;
    expect(t.id).toBe('a');
    expect(t.label).toBe('Renamed');
    expect(t.metadata!.body).toBe('- type: arch\n- team: Core\n\nHello');
    expect(t.metadata!.attrs.get('team')).toBe('Core');
  });

  it('removes the metadata block when everything is emptied', () => {
    const next = updateTask(makeDoc(), 'a', { label: 'A', attrs: [], notes: '  ' });
    expect(next.tasks.get('a')!.metadata).toBeNull();
  });
});

describe('new task keys / keyCatalog', () => {
  it('writes the draft keys as the new task\'s metadata, dropping blank keys', () => {
    const { doc: next, id } = addTaskAfter(makeDoc(), 'a', {
      label: 'X',
      duration: 1,
      section: 'S',
      attrs: [['owner', ' Sam '], ['', 'dropped']],
    });
    expect(next.tasks.get(id)!.metadata!.body).toBe('- owner: Sam');
    const r = parseDocument(serializeDocument(next));
    expect(r.ok && r.doc.tasks.get(id)!.metadata!.attrs.get('owner')).toBe('Sam');
    const bare = addTaskAt(makeDoc(), '2026-01-05', { label: 'Y', duration: 1, section: 'S', attrs: [] });
    expect(bare.doc.tasks.get(bare.id)!.metadata).toBeNull();
  });

  it('lists used keys and their values, most used first', () => {
    let doc = makeDoc();
    doc = updateTask(doc, 'a', { label: 'A', attrs: [['team', 'Core'], ['owner', 'Jo']], notes: '' });
    doc = updateTask(doc, 'b', { label: 'B', attrs: [['owner', 'Sam']], notes: '' });
    doc = updateTask(doc, 'c', { label: 'C', attrs: [['owner', 'Sam'], ['team', '']], notes: '' });
    expect(keyCatalog(doc)).toEqual([
      { key: 'owner', count: 3, values: [{ value: 'Sam', count: 2 }, { value: 'Jo', count: 1 }] },
      { key: 'team', count: 2, values: [{ value: 'Core', count: 1 }] },
    ]);
  });
});
