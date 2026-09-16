// Referential + structural validation over a correlated document: `after` targets must
// exist, and the dependency graph must be acyclic. Returns fatal errors that gate the
// render (brainstorm §7.3: invalid code keeps the last good render).

import type { ParseError, ParsedDocument } from '../model/types';
import { buildGraph, topoSort } from '../compute/graph';

export function validate(doc: ParsedDocument): ParseError[] {
  const errors: ParseError[] = [];

  // Unknown `after` targets.
  for (const task of doc.tasks.values()) {
    if (task.position.kind !== 'after') continue;
    for (const dep of task.position.ids) {
      if (!doc.tasks.has(dep)) {
        errors.push({
          code: 'UNKNOWN_AFTER_TARGET',
          message: `Task "${task.id}" depends on unknown id "${dep}".`,
          line: task.sourceLine,
          relatedIds: [task.id, dep],
        });
      }
    }
  }
  // Unknown references make the graph incomplete; report those first and stop.
  if (errors.length > 0) return errors;

  const topo = topoSort(buildGraph(doc.tasks));
  if (topo.order === null) {
    const cycle = topo.cycle ?? [];
    errors.push({
      code: 'CYCLE_DETECTED',
      message: `Dependency cycle detected: ${cycle.join(' → ')}.`,
      relatedIds: cycle,
    });
  }
  return errors;
}
