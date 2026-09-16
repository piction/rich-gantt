// Timescale tick generation for the three zoom levels. Pure functions over epoch days;
// the active zoom is a view concern and never stored (brainstorm §7.4).

import { dayOfWeek, isFirstOfMonth, formatDayLabel, formatMonthLabel } from '../compute/dateMath';
import type { ZoomLevel } from './scale';

export interface Tick {
  day: number; // epoch day the tick sits on
  label: string;
}

/**
 * Generate ticks across [t0, t1] (inclusive, in whole epoch days) for the given zoom level:
 *  - month: one tick per 1st-of-month
 *  - week:  one tick per Monday
 *  - day:   one tick per calendar day
 */
export function generateTicks(t0: number, t1: number, level: ZoomLevel): Tick[] {
  const start = Math.floor(t0);
  const end = Math.ceil(t1);
  const ticks: Tick[] = [];

  for (let day = start; day <= end; day++) {
    if (level === 'month') {
      if (isFirstOfMonth(day)) ticks.push({ day, label: formatMonthLabel(day) });
    } else if (level === 'week') {
      if (dayOfWeek(day) === 1) ticks.push({ day, label: formatDayLabel(day) });
    } else {
      ticks.push({ day, label: formatDayLabel(day) });
    }
  }
  return ticks;
}
