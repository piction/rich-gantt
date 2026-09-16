// Single source of truth. sourceText is the raw file; parsing it produces the model that
// both panes project from. The validity gate (brainstorm §7.3): a successful parse advances
// activeDocument; a failed parse only updates parseErrors and LEAVES the last good document
// in place, so the visualization keeps rendering while the code is invalid.

import { writable, derived } from 'svelte/store';
import { parseDocument } from '../parser';
import { computeSchedule } from '../compute/scheduler';
import { serializeDocument } from '../serializer';
import type { ParsedDocument, ParseError, ScheduleResult } from '../model/types';

const DEFAULT_SOURCE = [
  '```mermaid',
  'gantt',
  '    title New plan',
  '    dateFormat YYYY-MM-DD',
  '',
  '    section Start',
  '    First task :a, 2026-01-01, 3d',
  '    Next task  :b, after a, 2d',
  '```',
  '',
  '## Task metadata: a',
  '',
  '- type: task',
  '- owner: you',
  '',
  'The anchor.',
].join('\n');

export const sourceText = writable(DEFAULT_SOURCE);
export const activeDocument = writable<ParsedDocument | null>(null);
export const parseErrors = writable<ParseError[]>([]);
export const warnings = writable<ParseError[]>([]);

export const schedule = derived(activeDocument, ($doc): ScheduleResult | null =>
  $doc ? computeSchedule($doc) : null,
);

function runParse(text: string): void {
  const result = parseDocument(text);
  if (result.ok) {
    activeDocument.set(result.doc);
    parseErrors.set([]);
    warnings.set(result.warnings);
  } else {
    parseErrors.set(result.errors); // activeDocument intentionally untouched
    warnings.set([]);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
const DEBOUNCE_MS = 300;

/** Editor edits: debounced re-parse (brainstorm §7.3). */
export function updateSource(text: string): void {
  sourceText.set(text);
  clearTimeout(timer);
  timer = setTimeout(() => runParse(text), DEBOUNCE_MS);
}

/** File load / initial: parse immediately, no debounce. */
export function loadSource(text: string): void {
  sourceText.set(text);
  clearTimeout(timer);
  runParse(text);
}

/**
 * Visual edit (a bar drag): serialize the mutated model to canonical text and re-parse it,
 * so the editor pane and the model stay in sync (brainstorm §7.3 visual→text path).
 */
export function commitDocument(doc: ParsedDocument): void {
  loadSource(serializeDocument(doc));
}

// Parse the default immediately so the first paint has a chart.
runParse(DEFAULT_SOURCE);
