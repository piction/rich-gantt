// Pure geometry: turns a ParsedDocument + ScheduleResult + zoom into positioned SVG
// primitives (bars, arrows, ticks, section bands, weekend shading). No DOM/Svelte here so
// it is unit-testable; Timeline.svelte just draws what this returns.

import type { ParsedDocument, ScheduleResult } from '../model/types';
import { dayToX, PX_PER_DAY, type ZoomLevel } from './scale';
import { generateTicks, type Tick } from './ticks';
import { isWeekend, workingDaysBetween } from '../compute/dateMath';
import { buildColorScale, availableColorKeys } from './colors';

export interface LayoutConfig {
  rowHeight: number;
  sectionHeaderHeight: number;
  headerHeight: number; // axis area at the top
  barPadY: number;
  padDays: number; // blank days on each side of the timeline
}

// Cosmetic gap opened at the seam of two touching packed bars, so each keeps its own rounded
// outline and the sequence reads as distinct segments. Wide enough for the chevron to live in
// the gap rather than overlapping (and stealing clicks from) the neighbouring bars.
const SEAM_GAP = 9;

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
  packedAfter?: string; // predecessor id this bar shares a row with (linear after-chain)
}

export interface Arrow {
  from: string;
  to: string;
  d: string; // SVG path
}

/**
 * A packed linear `after` edge: the successor shares a row with, and sits to the right of, its
 * sole predecessor, so the elbow arrow is replaced by a chevron at the successor's front.
 * `fromX` is the predecessor's end x; `fromX < x` means there is a gap between the two bars.
 */
export interface Junction {
  toId: string;
  x: number; // chevron center x (seam midpoint when touching, else successor front)
  y: number; // row center y
  fromX: number; // predecessor end x
  gap: boolean; // true when a real schedule gap separates the bars (draw a dashed lead-in)
}

export interface SectionBand {
  name: string;
  y: number;
  height: number;
  // Section duration: days from the first task's start to the last task's end. Measured in
  // working days when weekends are excluded (matching how task durations are counted), else in
  // calendar days. `totalWorkDays` is the sum of the individual task durations — the time it
  // would take if every task ran one after another. Dates bracket the same span.
  durationDays: number;
  totalWorkDays: number;
  startDate: string; // YYYY-MM-DD of the earliest task start ('' when the section is empty)
  endDate: string; // YYYY-MM-DD of the latest task end ('' when the section is empty)
  hasTasks: boolean;
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
  weekendDayScale: number;
  bars: Bar[];
  barsById: Map<string, Bar>;
  arrows: Arrow[];
  junctions: Junction[];
  sections: SectionBand[];
  ticks: AxisTick[];
  weekends: WeekendBand[];
}

export function computeLayout(
  doc: ParsedDocument,
  schedule: ScheduleResult,
  zoom: ZoomLevel,
  colorKey: string | null = null,
  weekendDayScale = 1,
  config: LayoutConfig = DEFAULT_CONFIG,
): Layout {
  const pxPerDay = PX_PER_DAY[zoom];
  const excluded = weekendDayScale < 1; // working-day layout when weekends are excluded
  const scheduled = [...schedule.tasks.values()];

  // Timeline extent.
  const minStart = scheduled.length
    ? Math.min(...scheduled.map((s) => s.startDay))
    : 0;
  const maxEnd = scheduled.length ? Math.max(...scheduled.map((s) => s.endDay)) : 1;
  const t0 = Math.floor(minStart) - config.padDays;
  const t1 = Math.ceil(maxEnd) + config.padDays;

  const x = (day: number) => dayToX(day, t0, pxPerDay, weekendDayScale);
  const width = x(t1);

  // Bars are colored by a single metadata attribute (Design 1); one scale for the whole doc
  // keeps a value's color identical across sections. The key defaults to the first metadata
  // attribute in document order; the UI can override it.
  const key = colorKey ?? availableColorKeys(doc)[0] ?? null;
  const colorFor = buildColorScale(
    key === null ? [] : [...doc.tasks.values()].map((t) => t.metadata?.attrs.get(key)),
  );

  // Rows: section header then its task rows, top to bottom. Consecutive tasks in a section
  // that form a linear `after` chain are PACKED onto one row (successor to the right of its
  // sole predecessor) to compact the chart; anything else starts a new row. Milestones never
  // pack and reset the row so a following task cannot land on a zero-width diamond.
  const bars: Bar[] = [];
  const barsById = new Map<string, Bar>();
  const sections: SectionBand[] = [];
  const junctions: Junction[] = [];
  let y = config.headerHeight;

  doc.sections.forEach((section) => {
    const bandStart = y;
    y += config.sectionHeaderHeight;
    const bh = config.rowHeight - 2 * config.barPadY;
    let rowTop = y; // top of the current open row
    let rowTail: string | null = null; // last non-milestone id placed on the current row
    let hasRow = false;
    // Section duration accumulators: extent (first start → last end) and summed task work.
    let secMinStart = Infinity;
    let secMaxEnd = -Infinity;
    let secStartStr = '';
    let secEndStr = '';
    let secWork = 0;
    for (const id of section.taskIds) {
      const s = schedule.tasks.get(id);
      const task = doc.tasks.get(id);
      if (!s || !task) continue;
      if (s.startDay < secMinStart) {
        secMinStart = s.startDay;
        secStartStr = s.start;
      }
      if (s.endDay > secMaxEnd) {
        secMaxEnd = s.endDay;
        secEndStr = s.end;
      }
      secWork += task.duration;
      const isMilestone = task.kind === 'milestone' || s.endDay === s.startDay;
      const packedAfter =
        hasRow &&
        !isMilestone &&
        task.position.kind === 'after' &&
        task.position.ids.length === 1 &&
        task.position.ids[0] === rowTail
          ? rowTail
          : undefined;
      if (!packedAfter) {
        rowTop = y;
        y += config.rowHeight;
        hasRow = true;
      }
      let bx = x(s.startDay);
      let bw = Math.max(0, x(s.endDay) - x(s.startDay));
      const by = rowTop + config.barPadY;

      // Open a small seam gap so touching packed bars read as distinct segments (see SEAM_GAP).
      if (packedAfter) {
        const pred = barsById.get(packedAfter)!;
        const predEnd = pred.x + pred.w;
        const touching = Math.abs(predEnd - bx) < 0.5;
        const inset = touching ? Math.min(SEAM_GAP, Math.max(0, bw - 2)) : 0;
        bx += inset;
        bw -= inset;
        junctions.push({
          toId: id,
          x: touching ? predEnd + inset / 2 : bx,
          y: by + bh / 2,
          fromX: predEnd,
          gap: !touching,
        });
      }

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
        ...(packedAfter ? { packedAfter } : {}),
      };
      bars.push(bar);
      barsById.set(id, bar);
      rowTail = isMilestone ? null : id;
    }
    const hasTasks = secMaxEnd > -Infinity;
    const durationDays = hasTasks
      ? excluded
        ? workingDaysBetween(secMinStart, secMaxEnd)
        : secMaxEnd - secMinStart
      : 0;
    sections.push({
      name: section.name,
      y: bandStart,
      height: y - bandStart,
      durationDays,
      totalWorkDays: secWork,
      startDate: secStartStr,
      endDate: secEndStr,
      hasTasks,
    });
  });

  const height = Math.max(y, config.headerHeight + config.rowHeight);

  // Arrows: predecessor end-center → successor front-center, as an elbow. A packed edge
  // (successor sharing its predecessor's row) is drawn as a chevron junction instead (built
  // above, where the seam geometry is known).
  const arrows: Arrow[] = [];
  for (const task of doc.tasks.values()) {
    if (task.position.kind !== 'after') continue;
    const to = barsById.get(task.id);
    if (!to) continue;
    for (const depId of task.position.ids) {
      const from = barsById.get(depId);
      if (!from) continue;
      if (to.packedAfter === depId) continue; // drawn as a chevron junction
      arrows.push({ from: depId, to: task.id, d: elbow(from, to) });
    }
  }

  // Ticks + weekend shading. When weekends are excluded, drop the per-weekend-day labels
  // (only produced at day zoom) so the compressed weekend slivers stay unlabeled.
  const ticks: AxisTick[] = generateTicks(t0, t1, zoom)
    .filter((t: Tick) => !(excluded && zoom === 'day' && isWeekend(t.day)))
    .map((t: Tick) => ({ x: x(t.day), label: t.label }));
  const weekends: WeekendBand[] = [];
  if (zoom !== 'month') {
    for (let day = t0; day < t1; day++) {
      if (isWeekend(day)) weekends.push({ x: x(day), w: x(day + 1) - x(day) });
    }
  }

  return {
    width,
    height,
    headerHeight: config.headerHeight,
    t0,
    pxPerDay,
    weekendDayScale,
    bars,
    barsById,
    arrows,
    junctions,
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
