// Parses the `## Task metadata: <id>` blocks into a map keyed by task id. Each block keeps
// its whole markdown body (rendered in the hover card) plus an `attrs` dictionary parsed from
// the leading contiguous `- key: value` bullet run (used for render decisions like coloring).

import type { ParseError, TaskMetadata } from '../model/types';
import type { MetadataBlock, SourceLine } from './tokenizer';

// A dictionary bullet: `- key: value` (or `*`), tolerant of surrounding whitespace.
const KV_RE = /^\s*[-*]\s+([^:]+?)\s*:\s*(.*)$/;

export interface MetadataParseResult {
  metadata: Map<string, TaskMetadata>;
  errors: ParseError[];
}

export function parseMetadata(blocks: MetadataBlock[]): MetadataParseResult {
  const metadata = new Map<string, TaskMetadata>();
  const errors: ParseError[] = [];

  for (const block of blocks) {
    if (metadata.has(block.id)) {
      errors.push({
        code: 'DUPLICATE_ID',
        message: `Duplicate metadata block for id "${block.id}".`,
        line: block.headerLineNo,
        relatedIds: [block.id],
      });
      continue;
    }
    metadata.set(block.id, {
      id: block.id,
      attrs: parseAttrs(block.bodyLines),
      body: block.bodyLines.map((l) => l.text).join('\n'),
    });
  }

  return { metadata, errors };
}

/** The leading contiguous run of `- key: value` bullets; stops at the first non-matching line. */
function parseAttrs(bodyLines: SourceLine[]): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const line of bodyLines) {
    const m = KV_RE.exec(line.text);
    if (!m) break;
    attrs.set(m[1].trim(), m[2].trim()); // last wins on a duplicate key
  }
  return attrs;
}
