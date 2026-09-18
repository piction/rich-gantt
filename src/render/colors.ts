// Colors are a view concern: render code only emits CSS-variable references / class names,
// never literal colors (brainstorm §6.1, §8.1). Actual values live in app.css :root blocks,
// giving free light/dark theming.

import type { ParsedDocument } from '../model/types';

const PALETTE_SIZE = 6;
const NONE_FILL = 'var(--bar-none)'; // tasks whose color key is missing/None
const NONE_LABEL = 'var(--bar-none-fg)';

/** A fill + the label color that contrasts it (both CSS-variable references). */
export interface BarColor {
  fill: string;
  labelFill: string;
}

/**
 * Distinct metadata keys across the document, in first-seen (document) order. The first key
 * is the default coloring attribute; the UI dropdown lets the user pick any of these.
 */
export function availableColorKeys(doc: ParsedDocument): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const id of doc.order) {
    const attrs = doc.tasks.get(id)?.metadata?.attrs;
    if (!attrs) continue;
    for (const key of attrs.keys()) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Build a deterministic value → color mapping for a categorical attribute. Distinct values are
 * sorted (so colors are stable across reloads and reorderings) and assigned the cycled bar
 * palette; a missing/empty value (None) gets the neutral fill. Each color carries a matching
 * label color (--bar-N-fg) chosen in app.css to contrast that fill in both themes.
 */
export function buildColorScale(
  values: Iterable<string | undefined>,
): (v: string | undefined) => BarColor {
  const distinct = [...new Set([...values].filter((v): v is string => !!v))].sort();
  const byValue = new Map(distinct.map((v, i) => [v, i % PALETTE_SIZE]));
  return (v) => {
    const i = v !== undefined ? byValue.get(v) : undefined;
    return i === undefined
      ? { fill: NONE_FILL, labelFill: NONE_LABEL }
      : { fill: `var(--bar-${i})`, labelFill: `var(--bar-${i}-fg)` };
  };
}

/** One value of the coloring key paired with the fill its bars use. */
export interface LegendEntry {
  value: string; // 'None' for tasks missing a value for the key
  fill: string;
}

/**
 * Legend entries for coloring the document by `key`: each distinct value (sorted, matching
 * buildColorScale's assignment) with its fill, plus a trailing None entry when any task lacks a
 * value. Returns [] when no key is selected.
 */
export function colorLegend(doc: ParsedDocument, key: string | null): LegendEntry[] {
  if (key === null) return [];
  const values = [...doc.tasks.values()].map((t) => t.metadata?.attrs.get(key));
  const colorFor = buildColorScale(values);
  const distinct = [...new Set(values.filter((v): v is string => !!v))].sort();
  const entries: LegendEntry[] = distinct.map((v) => ({ value: v, fill: colorFor(v).fill }));
  if (values.some((v) => !v)) entries.push({ value: 'None', fill: NONE_FILL });
  return entries;
}
