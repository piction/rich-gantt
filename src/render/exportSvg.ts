// Image export: one standalone SVG of the chart — optional title header, section column,
// timeline, optional color legend — with every color a literal, so it renders the same as a
// file, in an <img>, or rasterized to PNG. Draws only the static chart: no selection, focus
// dimming, proposed bars or connector dots can leak in. Geometry comes from computeLayout, so
// it matches the timeline.

import type { Layout, Bar } from './layout';
import type { LegendEntry } from './colors';
import {
  textWidth,
  fitLabel,
  fitDuration,
  fmtDays,
  nameColumnWidth,
  fitSectionName,
  LABEL_PAD,
  BOLD,
  COL_PAD,
  COL_GAP,
} from './text';

/** CSS custom properties the export reads (resolved per theme by `readTheme`). */
export const THEME_VARS = [
  '--timeline-bg',
  '--fg',
  '--fg-muted',
  '--border',
  '--gridline',
  '--weekend-fill',
  '--section-alt',
  '--bar-stroke',
  '--arrow',
  '--bar-none',
  '--bar-none-fg',
  ...[0, 1, 2, 3, 4, 5].flatMap((i) => [`--bar-${i}`, `--bar-${i}-fg`]),
];
export type ThemeColors = Record<string, string>;

/**
 * The THEME_VARS values of `theme`, read from app.css by flipping :root's data-theme. Set and
 * restore happen synchronously, so the page never repaints in the other theme.
 */
export function readTheme(theme: 'light' | 'dark'): ThemeColors {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = theme;
  const cs = getComputedStyle(root);
  const colors = Object.fromEntries(THEME_VARS.map((v) => [v, cs.getPropertyValue(v).trim()]));
  if (prev === undefined) delete root.dataset.theme;
  else root.dataset.theme = prev;
  return colors;
}

export interface ExportOptions {
  colors: ThemeColors;
  title?: { name: string; meta: string } | null;
  legend?: LegendEntry[];
  durations: Map<string, number>; // task id → duration, for the in-bar "5d"
}

const PAD = 16;
const HEAD = 44; // title header height
const LEGEND_H = 32;
const TITLE_FONT = '700 18px system-ui, sans-serif';
const FONT = '12px system-ui, sans-serif';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function exportSvg(layout: Layout, opts: ExportOptions): { svg: string; width: number; height: number } {
  const { colors, title, legend = [], durations } = opts;
  const c = (v: string): string => v.replace(/var\((--[\w-]+)\)/g, (m, name) => colors[name] ?? m);
  const colW = nameColumnWidth(layout.sections);
  const head = title ? HEAD : 0;
  const legendH = legend.length ? LEGEND_H : 0;
  const width = colW + layout.width + 2 * PAD;
  const height = head + layout.height + legendH + PAD + (title ? 0 : PAD);
  const top = title ? head : PAD;
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
  );
  push(
    `<defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">` +
      `<path d="M0,0 L6,3 L0,6 Z" fill="${c('var(--arrow)')}"/></marker></defs>`,
  );
  push(`<rect width="${width}" height="${height}" fill="${c('var(--timeline-bg)')}"/>`);

  if (title) {
    push(`<text x="${PAD}" y="29" font-size="18" font-weight="700" fill="${c('var(--fg)')}">${esc(title.name)}</text>`);
    if (title.meta)
      push(
        `<text x="${PAD + textWidth(title.name, TITLE_FONT) + 12}" y="29" font-size="12" fill="${c('var(--fg-muted)')}">${esc(title.meta)}</text>`,
      );
  }

  // --- section-name column ---
  push(`<g transform="translate(${PAD},${top})">`);
  layout.sections.forEach((s, i) => {
    if (i % 2 === 1) push(`<rect y="${s.y}" width="${colW}" height="${s.height}" fill="${c('var(--section-alt)')}"/>`);
    const name = fitSectionName(s, colW);
    push(
      `<text x="${COL_PAD}" y="${s.y + 16}" font-size="12" font-weight="600" fill="${c('var(--fg-muted)')}">${esc(name)}</text>`,
    );
    if (s.hasTasks)
      push(
        `<text x="${COL_PAD + textWidth(name, BOLD) + COL_GAP}" y="${s.y + 16}" font-size="11" fill="${c('var(--fg-muted)')}" opacity="0.7">${fmtDays(s.durationDays)}</text>`,
      );
  });
  push(`<line x1="${colW - 0.5}" y1="0" x2="${colW - 0.5}" y2="${layout.height}" stroke="${c('var(--border)')}"/>`);
  push(`</g>`);

  // --- timeline ---
  push(`<g transform="translate(${PAD + colW},${top})">`);
  const gridH = layout.height - layout.headerHeight;
  for (const w of layout.weekends)
    push(`<rect x="${w.x}" y="${layout.headerHeight}" width="${w.w}" height="${gridH}" fill="${c('var(--weekend-fill)')}"/>`);
  for (const t of layout.ticks)
    push(`<line x1="${t.x}" y1="${layout.headerHeight}" x2="${t.x}" y2="${layout.height}" stroke="${c('var(--gridline)')}"/>`);
  layout.sections.forEach((s, i) => {
    if (i % 2 === 1)
      push(`<rect y="${s.y}" width="${layout.width}" height="${s.height}" fill="${c('var(--section-alt)')}"/>`);
  });
  for (const t of layout.ticks)
    push(`<text x="${t.x + 3}" y="18" font-size="11" fill="${c('var(--fg-muted)')}">${esc(t.label)}</text>`);

  const stroke = `stroke="${c('var(--bar-stroke)')}"`;
  for (const b of layout.bars) push(bar(b, durations.get(b.id), c, stroke));

  for (const a of layout.arrows)
    push(`<path d="${a.d}" fill="none" stroke="${c('var(--arrow)')}" stroke-width="1.5" marker-end="url(#arrowhead)"/>`);
  for (const j of layout.junctions) {
    if (j.gap)
      push(
        `<line x1="${j.fromX}" y1="${j.y}" x2="${j.x}" y2="${j.y}" stroke="${c('var(--arrow)')}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
      );
    // Same chevron as Timeline.svelte's chevronPath (CHEV = 4, CHEV_SHIFT = 2).
    const cx = j.x + 2;
    push(
      `<path d="M ${cx - 4},${j.y - 4} L ${cx + 1},${j.y} L ${cx - 4},${j.y + 4}" fill="none" stroke="${c('var(--arrow)')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  push(`</g>`);

  // --- legend ---
  if (legend.length) {
    const y = top + layout.height + 12;
    let x = PAD;
    for (const e of legend) {
      push(`<rect x="${x}" y="${y}" width="12" height="12" rx="3" fill="${c(e.fill)}" ${stroke}/>`);
      push(`<text x="${x + 17}" y="${y + 10}" font-size="12" fill="${c('var(--fg)')}">${esc(e.value)}</text>`);
      x += 17 + textWidth(e.value, FONT) + 16;
    }
  }

  push(`</svg>`);
  return { svg: out.join('\n'), width, height };
}

function bar(b: Bar, duration: number | undefined, c: (v: string) => string, stroke: string): string {
  if (b.isMilestone) {
    const r = b.h / 2;
    return (
      `<path d="M ${b.cx},${b.cy - r} L ${b.cx + r},${b.cy} L ${b.cx},${b.cy + r} L ${b.cx - r},${b.cy} Z" fill="${c(b.fill)}" ${stroke}/>` +
      `<text x="${b.cx + b.h}" y="${b.cy + 4}" font-size="12" fill="${c('var(--fg)')}">${esc(b.label)}</text>`
    );
  }
  const fg = c(b.labelFill);
  const dur = duration === undefined ? '' : fitDuration(b, duration);
  return (
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="${c(b.fill)}" ${stroke}/>` +
    `<text x="${b.x + LABEL_PAD}" y="${b.cy + 4}" font-size="12" fill="${fg}">${esc(fitLabel(b))}</text>` +
    (dur
      ? `<text x="${b.x + b.w - LABEL_PAD}" y="${b.cy + 4}" text-anchor="end" font-size="12" fill="${fg}" opacity="0.7">${dur}</text>`
      : '')
  );
}

/** Rasterize an SVG string to a PNG blob at `scale`× its size. */
export async function svgToPng(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}
