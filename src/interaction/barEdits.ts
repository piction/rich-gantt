// Pure model edits behind the bar gestures (end-edge resize, dot connector, focus mode). Each returns
// a new ParsedDocument; successors are NOT touched here — they cascade automatically because
// they are `after` this task and get recomputed by the scheduler.

import type { ParsedDocument, Task, TaskId } from '../model/types';
import { KV_RE } from '../parser/metadataParser';

function withTask(
  doc: ParsedDocument,
  id: TaskId,
  mutate: (t: Task) => Task,
): ParsedDocument {
  const task = doc.tasks.get(id);
  if (!task) return doc;
  const tasks = new Map(doc.tasks);
  tasks.set(id, mutate(task));
  return { ...doc, tasks };
}

/** Durations are non-negative multiples of 0.5 days. */
function snapDuration(days: number): number {
  return Math.max(0.5, Math.round(days * 2) / 2);
}

/**
 * End-edge drag: extend/shrink duration. Position (absolute or `after`) is untouched, so
 * incoming dependencies are preserved and outgoing successors cascade.
 */
export function setDuration(
  doc: ParsedDocument,
  id: TaskId,
  durationDays: number,
): ParsedDocument {
  return withTask(doc, id, (t) => ({ ...t, duration: snapDuration(durationDays) }));
}

/** Does `id` already depend (transitively) on `target` via its `after` chain? */
function dependsOn(doc: ParsedDocument, id: TaskId, target: TaskId): boolean {
  const seen = new Set<TaskId>();
  const stack: TaskId[] = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const task = doc.tasks.get(cur);
    if (task?.position.kind === 'after') stack.push(...task.position.ids);
  }
  return false;
}

/**
 * Is the connect gesture from→to legal? Rejects self-links, edges to a non-existent task,
 * duplicates, and any edge that would introduce a cycle (from already depends on to).
 */
export function canAddDependency(
  doc: ParsedDocument,
  fromId: TaskId,
  toId: TaskId,
): boolean {
  if (fromId === toId) return false;
  const to = doc.tasks.get(toId);
  if (!to || !doc.tasks.has(fromId)) return false;
  if (to.position.kind === 'after' && to.position.ids.includes(fromId)) return false;
  return !dependsOn(doc, fromId, toId);
}

/**
 * Dot-connector drop (§6.8): add an `after fromId` edge to `toId`. The front dot ACCUMULATES
 * fan-in, so an existing `after` gains a predecessor; an absolute task converts to `after`
 * (position is either/or — its absolute date is dropped, as it is now derived). No-op when
 * the edge is illegal (see canAddDependency).
 */
export function addDependency(
  doc: ParsedDocument,
  fromId: TaskId,
  toId: TaskId,
): ParsedDocument {
  if (!canAddDependency(doc, fromId, toId)) return doc;
  return withTask(doc, toId, (t) => {
    const ids = t.position.kind === 'after' ? [...t.position.ids, fromId] : [fromId];
    return { ...t, position: { kind: 'after', ids } };
  });
}

// --- Focus-mode edits (pill / popovers on a selected bar) ---

/** Labels sit before the first ':' of a task line, so a ':' or newline would break the parse. */
function cleanLabel(s: string): string {
  return s.replace(/[:\r\n]+/g, ' ').trim();
}

/**
 * Move / unlink: pin a task to an absolute start date. Position is either/or, so any `after`
 * links are dropped — moving a dependent task deliberately breaks its dependencies.
 */
export function moveTask(doc: ParsedDocument, id: TaskId, date: string): ParsedDocument {
  return withTask(doc, id, (t) => ({ ...t, position: { kind: 'absolute', date } }));
}

/**
 * Delete a task (its metadata goes with it). Every direct successor is pinned to its current
 * start date (`startOf`), exactly as if it had been unlinked, so nothing else moves.
 */
export function deleteTask(
  doc: ParsedDocument,
  id: TaskId,
  startOf: (id: TaskId) => string,
): ParsedDocument {
  if (!doc.tasks.has(id)) return doc;
  const tasks = new Map(doc.tasks);
  tasks.delete(id);
  for (const [tid, t] of tasks) {
    if (t.position.kind === 'after' && t.position.ids.includes(id)) {
      tasks.set(tid, { ...t, position: { kind: 'absolute', date: startOf(tid) } });
    }
  }
  return {
    ...doc,
    tasks,
    order: doc.order.filter((x) => x !== id),
    sections: doc.sections.map((s) => ({ ...s, taskIds: s.taskIds.filter((x) => x !== id) })),
  };
}

/**
 * Id for a new task in `section`: the section's first word, alphanumerics only, lowercased and
 * cut to 5 characters, plus the smallest counter that makes it unique ("Foundation" → found1).
 */
export function newTaskId(doc: ParsedDocument, section: string): TaskId {
  const word = section.trim().split(/\s+/)[0] ?? '';
  const base = word.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'task';
  let n = 1;
  while (doc.tasks.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface NewTaskDraft {
  label: string;
  duration: number;
  section: string;
}

/**
 * Add a task `after afterId`. In the predecessor's own section it is inserted right below it;
 * in another section it is appended. Returns the new document and the generated id.
 */
export function addTaskAfter(
  doc: ParsedDocument,
  afterId: TaskId,
  draft: NewTaskDraft,
): { doc: ParsedDocument; id: TaskId } {
  const id = newTaskId(doc, draft.section);
  const tasks = new Map(doc.tasks);
  tasks.set(id, {
    id,
    label: cleanLabel(draft.label) || 'New task',
    section: draft.section,
    position: { kind: 'after', ids: [afterId] },
    duration: snapDuration(draft.duration),
    kind: 'task',
    sourceLine: 0,
    metadata: null,
  });
  const insertAfter = (ids: TaskId[]): TaskId[] => {
    const i = ids.indexOf(afterId);
    return i < 0 ? [...ids, id] : [...ids.slice(0, i + 1), id, ...ids.slice(i + 1)];
  };
  const sections = doc.sections.map((s) =>
    s.name === draft.section ? { ...s, taskIds: insertAfter(s.taskIds) } : s,
  );
  return { doc: { ...doc, tasks, sections, order: insertAfter(doc.order) }, id };
}

/** A metadata body split into its leading `- key: value` run and the free markdown after it. */
export interface MetadataParts {
  attrs: [string, string][];
  notes: string;
}

export function splitMetadataBody(body: string): MetadataParts {
  const lines = body.split('\n');
  const attrs: [string, string][] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const m = KV_RE.exec(lines[i]);
    if (!m) break;
    attrs.push([m[1].trim(), m[2].trim()]);
  }
  return { attrs, notes: lines.slice(i).join('\n').trim() };
}

/**
 * Editor save: label + metadata (keys and free markdown). Keys lose ':' (it ends the key) and
 * blank keys are dropped; an empty result removes the metadata block. The id never changes.
 */
export function updateTask(
  doc: ParsedDocument,
  id: TaskId,
  edit: { label: string } & MetadataParts,
): ParsedDocument {
  const attrs = edit.attrs
    .map(([k, v]): [string, string] => [
      k.replace(/:/g, '').trim(),
      v.replace(/[\r\n]+/g, ' ').trim(),
    ])
    .filter(([k]) => k !== '');
  const notes = edit.notes.trim();
  const body = [attrs.map(([k, v]) => `- ${k}: ${v}`).join('\n'), notes]
    .filter((part) => part !== '')
    .join('\n\n');
  return withTask(doc, id, (t) => ({
    ...t,
    label: cleanLabel(edit.label) || t.label,
    metadata: body ? { id, attrs: new Map(attrs), body } : null,
  }));
}
