// Canonical serializer: ParsedDocument → one deterministic text layout. Formatting is NOT
// preserved from the input — a stable normalized form yields clean version-control diffs
// (brainstorm §7.3). serialize is a pure function of the model, so it is idempotent.

import type { ParsedDocument, Position, Task } from '../model/types';

const INDENT = '    ';

export function serializeDocument(doc: ParsedDocument): string {
  return `${serializeMermaid(doc)}\n\n${serializeMetadata(doc)}\n`;
}

function serializeMermaid(doc: ParsedDocument): string {
  const lines: string[] = ['```mermaid', 'gantt'];
  if (doc.title) lines.push(`${INDENT}title ${doc.title}`);
  lines.push(`${INDENT}dateFormat ${doc.dateFormat}`);

  // Align the ':' across all task lines for readability (deterministic given the model).
  const labelWidth = Math.max(
    0,
    ...[...doc.tasks.values()].map((t) => t.label.length),
  );

  for (const section of doc.sections) {
    lines.push('');
    lines.push(`${INDENT}section ${section.name}`);
    for (const id of section.taskIds) {
      const task = doc.tasks.get(id);
      if (task) lines.push(serializeTaskLine(task, labelWidth));
    }
  }

  lines.push('```');
  return lines.join('\n');
}

function serializeTaskLine(task: Task, labelWidth: number): string {
  const label = task.label.padEnd(labelWidth);
  const tag = task.kind === 'milestone' ? 'milestone, ' : '';
  const pos = serializePosition(task.position);
  const dur = `${task.duration}d`;
  return `${INDENT}${label} :${tag}${task.id}, ${pos}, ${dur}`;
}

function serializePosition(pos: Position): string {
  return pos.kind === 'absolute' ? pos.date : `after ${pos.ids.join(' ')}`;
}

// One `## Task metadata: <id>` block per task that has metadata, in document order. The body
// is emitted verbatim (it is already canonicalized on parse: blank ends trimmed), so a
// parse → serialize → parse cycle is stable.
function serializeMetadata(doc: ParsedDocument): string {
  const blocks: string[] = [];
  for (const id of doc.order) {
    const meta = doc.tasks.get(id)?.metadata;
    if (!meta) continue;
    const heading = `## Task metadata: ${meta.id}`;
    blocks.push(meta.body ? `${heading}\n\n${meta.body}` : heading);
  }
  return blocks.join('\n\n');
}
