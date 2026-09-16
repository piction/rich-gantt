// Date→pixel scale. The whole mapping is one multiply; hand-rolled per brainstorm §8.2.
// Works in epoch-day units (fractional allowed) against a timeline origin t0.

export type ZoomLevel = 'month' | 'week' | 'day';

export const PX_PER_DAY: Record<ZoomLevel, number> = {
  month: 6,
  week: 22,
  day: 40,
};

/** Epoch day → x pixel, relative to the timeline origin t0 (also an epoch day). */
export function dayToX(day: number, t0: number, pxPerDay: number): number {
  return (day - t0) * pxPerDay;
}

/** Inverse of dayToX. */
export function xToDay(x: number, t0: number, pxPerDay: number): number {
  return t0 + x / pxPerDay;
}
