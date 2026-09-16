// Joins the schedule half (mermaid) with the metadata half (table) by task id into a
// ParsedDocument. Detects duplicate schedule ids (fatal) and metadata rows that reference
// an unknown id (non-fatal warning).

import type {
  ParseError,
  ParsedDocument,
  ScheduleTask,
  Section,
  Task,
  TaskMetadata,
} from '../model/types';

export interface CorrelateResult {
  doc: ParsedDocument;
  errors: ParseError[]; // fatal (duplicate schedule ids)
  warnings: ParseError[]; // non-fatal (orphan metadata rows)
}

export function correlate(
  title: string | null,
  dateFormat: string | null,
  scheduleTasks: ScheduleTask[],
  sections: Section[],
  metadata: Map<string, TaskMetadata>,
): CorrelateResult {
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];
  const tasks = new Map<string, Task>();
  const order: string[] = [];

  for (const st of scheduleTasks) {
    if (tasks.has(st.id)) {
      errors.push({
        code: 'DUPLICATE_ID',
        message: `Duplicate task id "${st.id}" in the schedule.`,
        line: st.sourceLine,
        relatedIds: [st.id],
      });
      continue;
    }
    tasks.set(st.id, { ...st, metadata: metadata.get(st.id) ?? null });
    order.push(st.id);
  }

  for (const id of metadata.keys()) {
    if (!tasks.has(id)) {
      warnings.push({
        code: 'METADATA_ROW_UNKNOWN_ID',
        message: `Metadata row "${id}" has no matching task in the schedule.`,
        relatedIds: [id],
      });
    }
  }

  const doc: ParsedDocument = {
    title,
    dateFormat: dateFormat ?? 'YYYY-MM-DD',
    sections,
    tasks,
    order,
  };
  return { doc, errors, warnings };
}
