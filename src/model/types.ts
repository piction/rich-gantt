// Core model contract — the single source of truth all other modules project from.
// Schedule (dynamic) lives in the mermaid block; metadata (static) lives in per-task
// `## Task metadata: <id>` markdown blocks. No field appears in both halves.

export type TaskId = string; // stable, immutable, unique within a document

/**
 * A task's position is EITHER an absolute start date OR a set of `after` predecessors,
 * never both. Modeled as a discriminated union so "both" is not representable from a
 * single well-formed parse — the parser must pick one or reject.
 */
export type Position =
  | { kind: 'absolute'; date: string } // YYYY-MM-DD
  | { kind: 'after'; ids: TaskId[] }; // fan-in when ids.length > 1

/** Duration in whole days, granularity 0.5 (validated: multiple of 0.5). */
export type DurationDays = number;

/** Mermaid bar kind. `done`/`active`/`crit` are tolerated on input but not modeled in v1. */
export type TaskKind = 'task' | 'milestone';

/** Schedule half — sourced only from the mermaid block. */
export interface ScheduleTask {
  id: TaskId;
  label: string;
  section: string;
  position: Position;
  duration: DurationDays;
  kind: TaskKind;
  sourceLine: number; // 1-based line in the source, for diagnostics
}

/**
 * Metadata half — sourced from a free-form `## Task metadata: <id>` markdown block.
 * `body` is the whole block, rendered as markdown in the hover card. `attrs` is the leading
 * `- key: value` bullet run parsed out of that body for render decisions (e.g. coloring);
 * a key absent from a task resolves to None. Keys are arbitrary — there is no fixed schema.
 */
export interface TaskMetadata {
  id: TaskId;
  attrs: Map<string, string>;
  body: string;
}

/** Joined view the rest of the app consumes. `metadata` is null when no block matches. */
export interface Task extends ScheduleTask {
  metadata: TaskMetadata | null;
}

export interface Section {
  name: string;
  taskIds: TaskId[]; // preserves source order
}

export interface ParsedDocument {
  title: string | null;
  dateFormat: string; // must be 'YYYY-MM-DD' in v1
  excludeWeekends: boolean; // mermaid `excludes weekends` directive; drives working-day layout
  sections: Section[];
  tasks: Map<TaskId, Task>;
  order: TaskId[]; // full document order, for canonical re-serialization
}

// --- Computed (derived from ParsedDocument, never stored) ---

export interface ScheduledTask {
  id: TaskId;
  // Numeric epoch-day offsets (days since 1970-01-01). Fractional (e.g. 3.5 = noon of
  // day 3) to support 0.5d durations. These drive the pixel scale directly.
  startDay: number;
  endDay: number;
  // Display dates, floored to the calendar day. start = floor(startDay), end = ceil(endDay).
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface ScheduleResult {
  tasks: Map<TaskId, ScheduledTask>;
  order: TaskId[]; // topological order
}

// --- Errors ---

export type ParseErrorCode =
  | 'MISSING_ID'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_AFTER_TARGET'
  | 'NEITHER_DATE_NOR_AFTER'
  | 'INVALID_DURATION_GRANULARITY'
  | 'CYCLE_DETECTED'
  | 'BAD_DATE_FORMAT'
  | 'MALFORMED_TASK_LINE'
  | 'METADATA_ROW_UNKNOWN_ID'
  | 'NO_MERMAID_BLOCK'
  | 'UNSUPPORTED_DATE_FORMAT';

export interface ParseError {
  code: ParseErrorCode;
  message: string; // human-readable, includes offending id/line
  line?: number; // 1-based source line, for CodeMirror diagnostics
  relatedIds?: TaskId[]; // e.g. the cycle path, or the unknown target
}

/** Result of parsing. Never thrown — always returned. */
export type ParseResult =
  | { ok: true; doc: ParsedDocument; warnings: ParseError[] }
  | { ok: false; errors: ParseError[] };
