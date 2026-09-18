// Date→pixel scale. Originally one multiply (brainstorm §8.2); now a piecewise map so
// weekends can be visually compressed ("exclude weekends"): a weekday occupies `pxPerDay`,
// a weekend day only `pxPerDay * weekendDayScale`. With weekendDayScale = 1 the map collapses
// back to the plain linear multiply, so nothing changes unless the user compresses weekends.
// Works in epoch-day units (fractional allowed) against a timeline origin t0.

import { isWeekend } from '../compute/dateMath';

export type ZoomLevel = 'month' | 'week' | 'day';

export const PX_PER_DAY: Record<ZoomLevel, number> = {
  month: 6,
  week: 22,
  day: 40,
};

// Per-weekend-day width (fraction of a weekday) when "exclude weekends" is on: 1/6 so the
// whole 2-day weekend occupies 1/3 of a day.
export const WEEKEND_EXCLUDED_SCALE = 1 / 6;

/**
 * Effective day-units between t0 and `day`, where a weekday counts 1 and a weekend day counts
 * `weekendDayScale`. This is the whole non-linearity; dayToX just scales it by pxPerDay.
 * t0 is assumed integer (the layout floors it). Handles day on either side of t0 and a
 * fractional tail (e.g. 0.5d durations) by scaling the tail by its own day's weight.
 */
function effectiveDays(t0: number, day: number, weekendDayScale: number): number {
  if (day === t0) return 0;
  const weight = (d: number) => (isWeekend(d) ? weekendDayScale : 1);
  let sum = 0;
  if (day > t0) {
    const whole = Math.floor(day);
    for (let d = t0; d < whole; d++) sum += weight(d);
    sum += (day - whole) * weight(whole);
  } else {
    // day < t0: mirror the walk, accumulating negative units.
    const whole = Math.floor(day);
    for (let d = whole; d < t0; d++) sum -= weight(d);
    sum += (day - whole) * weight(whole);
  }
  return sum;
}

/** Epoch day → x pixel, relative to the timeline origin t0 (also an epoch day). */
export function dayToX(day: number, t0: number, pxPerDay: number, weekendDayScale = 1): number {
  return effectiveDays(t0, day, weekendDayScale) * pxPerDay;
}

/** Inverse of dayToX. */
export function xToDay(x: number, t0: number, pxPerDay: number, weekendDayScale = 1): number {
  let units = x / pxPerDay; // effective day-units from t0
  if (units <= 0) return t0 + units; // before/at origin: weekday assumption is fine here
  let d = t0;
  // At most two consecutive weekend days, so a zero-width weekend is skipped in bounded steps.
  for (let guard = 0; guard < 1_000_000; guard++) {
    const w = isWeekend(d) ? weekendDayScale : 1;
    if (w <= 0) {
      d++; // this day occupies no width — step over it
      continue;
    }
    if (units < w) return d + units / w;
    units -= w;
    d++;
  }
  return d;
}
