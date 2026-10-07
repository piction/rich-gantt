// Canvas-based text measuring and the bar-label fitting built on it. Shared by the timeline and
// the image export so both clip labels identically.
import type { Bar, SectionBand } from './layout';

const ELLIPSIS = '...';
export const LABEL_PAD = 6; // inset of a label drawn inside its bar
const DUR_GAP = 8; // between an in-bar label and its duration

let measureCtx: CanvasRenderingContext2D | null = null;
export function textWidth(s: string, font = '12px system-ui, sans-serif'): number {
  if (typeof document !== 'undefined') measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 6.6;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}

/** `text` clipped to the widest prefix that fits `max` px with a trailing "...". */
export function fitText(text: string, max: number, font?: string): string {
  if (max <= 0) return '';
  if (textWidth(text, font) <= max) return text;
  let s = text;
  while (s.length && textWidth(s + ELLIPSIS, font) > max) s = s.slice(0, -1);
  return s ? s + ELLIPSIS : '';
}

// Labels are drawn inside the bar, colored to contrast the fill. A label that doesn't fit is
// clipped to the widest prefix that fits with a trailing "..." — so text never spills past the
// bar onto the page background (where its contrast is undefined).
export const fitLabel = (b: Bar): string => fitText(b.label, b.w - 2 * LABEL_PAD);

// Section duration shown next to its name; trims float artifacts from working-day spans.
export const fmtDays = (n: number): string => `${Math.round(n * 100) / 100}d`;

// Section-name column, left of the timeline: fits the longest "name  12d" up to COL_MAX
// (longer names get an ellipsis), and at least the "+ New section" placeholder.
export const BOLD = '600 12px system-ui, sans-serif';
export const SMALL = '11px system-ui, sans-serif';
export const COL_PAD = 10;
export const COL_GAP = 8; // between a section name and its duration
const COL_MIN = 130;
const COL_MAX = 220;
export function nameColumnWidth(sections: SectionBand[]): number {
  return Math.min(
    COL_MAX,
    Math.max(
      COL_MIN,
      ...sections.map(
        (s) => 2 * COL_PAD + textWidth(s.name, BOLD) + COL_GAP + textWidth(fmtDays(s.durationDays), SMALL),
      ),
    ),
  );
}
export function fitSectionName(s: SectionBand, colW: number): string {
  const dur = s.hasTasks ? COL_GAP + textWidth(fmtDays(s.durationDays), SMALL) : 0;
  return fitText(s.name, colW - 2 * COL_PAD - dur, BOLD);
}

// Right-aligned duration (e.g. "5d"), shown inside the bar only when the FULL label plus a
// gap plus the duration all fit — i.e. there is leftover space beyond the label.
export function fitDuration(b: Bar, duration: number): string {
  const s = `${duration}d`;
  const inner = b.w - 2 * LABEL_PAD;
  const labelW = textWidth(b.label);
  const need = (labelW > 0 ? labelW + DUR_GAP : 0) + textWidth(s);
  return need <= inner ? s : '';
}
