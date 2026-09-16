// Orchestrates the parse pipeline: tokenize → parse each half → correlate → validate.
// Collects all errors in one pass (so users see more than one problem at a time) and
// returns a Result. Never throws.

import type { ParseError, ParseResult } from '../model/types';
import { tokenize } from './tokenizer';
import { parseMermaid } from './mermaidParser';
import { parseMetadata } from './metadataParser';
import { correlate } from './correlate';
import { validate } from './validate';

export function parseDocument(source: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];

  const tokens = tokenize(source);
  if (!tokens.mermaidFound) {
    return {
      ok: false,
      errors: [
        {
          code: 'NO_MERMAID_BLOCK',
          message: 'No ```mermaid gantt block found in the document.',
        },
      ],
    };
  }

  const mermaid = parseMermaid(tokens.mermaidLines);
  const metadata = parseMetadata(tokens.metadataBlocks);
  errors.push(...mermaid.errors, ...metadata.errors);

  const correlated = correlate(
    mermaid.title,
    mermaid.dateFormat,
    mermaid.tasks,
    mermaid.sections,
    metadata.metadata,
  );
  errors.push(...correlated.errors);
  warnings.push(...correlated.warnings);

  // Referential/cycle checks only make sense once the schedule half parsed cleanly.
  if (errors.length === 0) {
    errors.push(...validate(correlated.doc));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, doc: correlated.doc, warnings };
}
