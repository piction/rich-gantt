// Dependency graph + topological sort with cycle detection. Shared by the parser's
// validation stage (to reject cycles) and the scheduler (to resolve dates in order).

import type { Task, TaskId } from '../model/types';

export interface Graph {
  nodes: TaskId[];
  /** predecessors[id] = ids whose end gates id's start (the `after` targets). */
  predecessors: Map<TaskId, TaskId[]>;
  /** successors[id] = ids that depend on id. */
  successors: Map<TaskId, TaskId[]>;
}

/**
 * Build the graph from the task map. Only edges between known nodes are included;
 * `after` references to unknown ids are the validator's concern, not the graph's.
 */
export function buildGraph(tasks: Map<TaskId, Task>): Graph {
  const nodes = [...tasks.keys()];
  const known = new Set(nodes);
  const predecessors = new Map<TaskId, TaskId[]>();
  const successors = new Map<TaskId, TaskId[]>();
  for (const id of nodes) {
    predecessors.set(id, []);
    successors.set(id, []);
  }
  for (const task of tasks.values()) {
    if (task.position.kind !== 'after') continue;
    for (const dep of task.position.ids) {
      if (!known.has(dep)) continue;
      predecessors.get(task.id)!.push(dep);
      successors.get(dep)!.push(task.id);
    }
  }
  return { nodes, predecessors, successors };
}

export interface TopoResult {
  order: TaskId[] | null; // null when a cycle exists
  cycle?: TaskId[]; // one offending cycle path, when detected
}

/** Kahn's algorithm. Returns a topological order, or a cycle path if one exists. */
export function topoSort(graph: Graph): TopoResult {
  const indegree = new Map<TaskId, number>();
  for (const id of graph.nodes) {
    indegree.set(id, graph.predecessors.get(id)!.length);
  }
  const queue = graph.nodes.filter((id) => indegree.get(id) === 0);
  const order: TaskId[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const succ of graph.successors.get(id)!) {
      const next = indegree.get(succ)! - 1;
      indegree.set(succ, next);
      if (next === 0) queue.push(succ);
    }
  }
  if (order.length === graph.nodes.length) return { order };
  return { order: null, cycle: findCycle(graph, indegree) };
}

/** DFS over the nodes still carrying indegree (i.e. inside cycles) to surface one path. */
function findCycle(graph: Graph, indegree: Map<TaskId, number>): TaskId[] {
  const inCycle = new Set(graph.nodes.filter((id) => indegree.get(id)! > 0));
  const stack: TaskId[] = [];
  const onStack = new Set<TaskId>();
  const visited = new Set<TaskId>();

  const dfs = (id: TaskId): TaskId[] | null => {
    stack.push(id);
    onStack.add(id);
    for (const succ of graph.successors.get(id)!) {
      if (!inCycle.has(succ)) continue;
      if (onStack.has(succ)) {
        return [...stack.slice(stack.indexOf(succ)), succ];
      }
      if (!visited.has(succ)) {
        const found = dfs(succ);
        if (found) return found;
      }
    }
    stack.pop();
    onStack.delete(id);
    visited.add(id);
    return null;
  };

  for (const id of inCycle) {
    if (!visited.has(id)) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  return [...inCycle]; // fallback, should not happen
}
