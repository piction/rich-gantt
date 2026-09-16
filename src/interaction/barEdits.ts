// Pure model edits behind the bar-zone drag gestures (brainstorm §6.7–§6.9). Each returns
// a new ParsedDocument; successors are NOT touched here — they cascade automatically because
// they are `after` this task and get recomputed by the scheduler.

import type { ParsedDocument, Task, TaskId } from '../model/types';
import { fromEpochDay } from '../compute/dateMath';

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

/** Absolute starts are whole calendar days (no time component in the file, §6.5). */
function snapDay(day: number): number {
  return Math.round(day);
}

/** Durations are non-negative multiples of 0.5 days. */
function snapDuration(days: number): number {
  return Math.max(0.5, Math.round(days * 2) / 2);
}

/**
 * Front-edge / middle drag: pin the task to an absolute start. This REPLACES the position,
 * so any incoming `after` is broken — the one destructive op (§6.9). Duration is preserved.
 */
export function setAbsoluteStart(
  doc: ParsedDocument,
  id: TaskId,
  startDay: number,
): ParsedDocument {
  return withTask(doc, id, (t) => ({
    ...t,
    position: { kind: 'absolute', date: fromEpochDay(snapDay(startDay)) },
  }));
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
