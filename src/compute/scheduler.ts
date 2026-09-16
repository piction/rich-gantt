// Resolves every task's concrete start/end from absolute anchors + `after` chains.
// Works in epoch-day floats so 0.5d durations chain exactly. Assumes the document already
// passed validation (acyclic, all `after` targets known) — the parser gates that.

import type { ParsedDocument, ScheduleResult, ScheduledTask, TaskId } from '../model/types';
import { buildGraph, topoSort } from './graph';
import { toEpochDay, fromEpochDay } from './dateMath';

export function computeSchedule(doc: ParsedDocument): ScheduleResult {
  const topo = topoSort(buildGraph(doc.tasks));
  const order = topo.order ?? doc.order; // fallback; validated docs are always acyclic
  const tasks = new Map<TaskId, ScheduledTask>();

  for (const id of order) {
    const task = doc.tasks.get(id);
    if (!task) continue;

    let startDay: number;
    if (task.position.kind === 'absolute') {
      startDay = toEpochDay(task.position.date);
    } else {
      const ends = task.position.ids
        .map((dep) => tasks.get(dep)?.endDay)
        .filter((v): v is number => v !== undefined);
      startDay = ends.length > 0 ? Math.max(...ends) : 0; // fan-in = latest predecessor end
    }
    const endDay = startDay + task.duration;

    tasks.set(id, {
      id,
      startDay,
      endDay,
      start: fromEpochDay(startDay),
      // Inclusive finish day for display: the last calendar day the bar touches.
      end: fromEpochDay(Math.max(Math.floor(startDay), Math.ceil(endDay) - 1)),
    });
  }

  return { tasks, order };
}
