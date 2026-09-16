// Pure geometry: turns a ParsedDocument + ScheduleResult + zoom into positioned SVG
// primitives (bars, arrows, ticks, section bands, weekend shading). No DOM/Svelte here so
// it is unit-testable; Timeline.svelte just draws what this returns.

import type { ParsedDocument, ScheduleResult } from '../model/types';
import { dayToX, PX_PER_DAY, type ZoomLevel } from './scale';
import { generateTicks, type Tick } from './ticks';
import { isWeekend } from '../compute/dateMath';
import { buildColorScale, availableColorKeys } from './colors';

export interface LayoutConfig {
  rowHeight: number;
  sectionHeaderHeight: number;
  headerHeight: number; // axis area at the top
  barPadY: number;
  padDays: number; // blank days on each side of the timeline
}

export const DEFAULT_CONFIG: LayoutConfig = {
  rowHeight: 28,
  sectionHeaderHeight: 24,
  headerHeight: 28,
  barPadY: 5,
  padDays: 1,
};

export interface Bar {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number; // center (used by milestones / arrow anchors)
  cy: number;
  label: string;
  fill: string;
  labelFill: string; // label color that contrasts `fill` (for labels drawn inside the bar)
  isMilestone: boolean;
}

export interface Arrow {
  from: string;
  to: string;
  d: string; // SVG path
}

export interface SectionBand {
  name: string;
  y: number;
  height: number;
}

export interface AxisTick {
  x: number;
  label: string;
}

export interface WeekendBand {
  x: number;
  w: number;
}

export interface Layout {
  width: number;
  height: number;
  headerHeight: number;
  t0: number;
  pxPerDay: number;
  bars: Bar[];
  barsById: Map<string, Bar>;
  arrows: Arrow[];
  sections: SectionBand[];
  ticks: AxisTick[];
  weekends: WeekendBand[];
}

export function computeLayout(
  doc: ParsedDocument,
  schedule: ScheduleResult,
  zoom: ZoomLevel,
  colorKey: string | null = null,
  config: LayoutConfig = DEFAULT_CONFIG,
): Layout {
  const pxPerDay = PX_PER_DAY[zoom];
  const scheduled = [...schedule.tasks.values()];

  // Timeline extent.
  const minStart = scheduled.length
    ? Math.min(...scheduled.map((s) => s.startDay))
    : 0;
  const maxEnd = scheduled.length ? Math.max(...scheduled.map((s) => s.endDay)) : 1;
  const t0 = Math.floor(minStart) - config.padDays;
  const t1 = Math.ceil(maxEnd) + config.padDays;
  const width = (t1 - t0) * pxPerDay;

  const x = (day: number) => dayToX(day, t0, pxPerDay);

  // Bars are colored by a single metadata attribute (Design 1); one scale for the whole doc
  // keeps a value's color identical across sections. The key defaults to the first metadata
  // attribute in document order; the UI can override it.
  const key = colorKey ?? availableColorKeys(doc)[0] ?? null;
  const colorFor = buildColorScale(
    key === null ? [] : [...doc.tasks.values()].map((t) => t.metadata?.attrs.get(key)),
  );

  // Rows: section header then its task rows, top to bottom.
  const bars: Bar[] = [];
  const barsById = new Map<string, Bar>();
  const sections: SectionBand[] = [];
  let y = config.headerHeight;

  doc.sections.forEach((section) => {
    const bandStart = y;
    y += config.sectionHeaderHeight;
    for (const id of section.taskIds) {
      const s = schedule.tasks.get(id);
      const task = doc.tasks.get(id);
      if (!s || !task) continue;
      const isMilestone = task.kind === 'milestone' || s.endDay === s.startDay;
      const bx = x(s.startDay);
      const bw = Math.max(0, (s.endDay - s.startDay) * pxPerDay);
      const by = y + config.barPadY;
      const bh = config.rowHeight - 2 * config.barPadY;
      const bar: Bar = {
        id,
        x: bx,
        y: by,
        w: bw,
        h: bh,
        cx: isMilestone ? bx : bx + bw,
        cy: by + bh / 2,
        label: task.label,
        ...(key === null ? colorFor(undefined) : colorFor(task.metadata?.attrs.get(key))),
        isMilestone,
      };
      bars.push(bar);
      barsById.set(id, bar);
      y += config.rowHeight;
    }
    sections.push({ name: section.name, y: bandStart, height: y - bandStart });
  });

  const height = Math.max(y, config.headerHeight + config.rowHeight);

  // Arrows: predecessor end-center → successor front-center, as an elbow.
  const arrows: Arrow[] = [];
  for (const task of doc.tasks.values()) {
    if (task.position.kind !== 'after') continue;
    const to = barsById.get(task.id);
    if (!to) continue;
    for (const depId of task.position.ids) {
      const from = barsById.get(depId);
      if (!from) continue;
      arrows.push({ from: depId, to: task.id, d: elbow(from, to) });
    }
  }

  // Ticks + weekend shading.
  const ticks: AxisTick[] = generateTicks(t0, t1, zoom).map((t: Tick) => ({
    x: x(t.day),
    label: t.label,
  }));
  const weekends: WeekendBand[] = [];
  if (zoom !== 'month') {
    for (let day = t0; day < t1; day++) {
      if (isWeekend(day)) weekends.push({ x: x(day), w: pxPerDay });
    }
  }

  return {
    width,
    height,
    headerHeight: config.headerHeight,
    t0,
    pxPerDay,
    bars,
    barsById,
    arrows,
    sections,
    ticks,
    weekends,
  };
}

/**
 * Anchor points for dependency edges and the dot connectors that draw them (§6.8).
 * The edge leaves a predecessor from the CENTER-BOTTOM (the source dot) and enters a
 * successor at its FRONT (the front dot) — nicer than end→front for tasks that come
 * directly after one another (predecessor above, successor below-and-left).
 */
export function sourceAnchor(
  bar: Bar,
  side: 'top' | 'bottom' = 'bottom',
): { x: number; y: number } {
  const dir = side === 'top' ? -1 : 1;
  return bar.isMilestone
    ? { x: bar.cx, y: bar.cy + dir * (bar.h / 2) }
    : { x: bar.x + bar.w / 2, y: side === 'top' ? bar.y : bar.y + bar.h };
}

export function frontAnchor(bar: Bar): { x: number; y: number } {
  return bar.isMilestone ? { x: bar.cx - bar.h / 2, y: bar.cy } : { x: bar.x, y: bar.cy };
}

/**
 * Single-corner (L-shaped) connector: leave the predecessor's center, go straight to the
 * successor's row height, then turn once to the right into its front. When the successor sits
 * ABOVE the predecessor the edge leaves from the center-TOP (else center-bottom), so the
 * vertical run heads away from the bar and never crosses it.
 */
function elbow(from: Bar, to: Bar): string {
  const above = to.cy < from.cy; // successor row is higher on screen than predecessor
  const s = sourceAnchor(from, above ? 'top' : 'bottom');
  const t = frontAnchor(to);
  return `M ${s.x},${s.y} V ${t.y} H ${t.x}`;
}
