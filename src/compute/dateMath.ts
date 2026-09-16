// Date math, isolated behind a tiny surface so the backing calendar library can be
// swapped (Temporal polyfill today; native Temporal or date-fns later) without touching
// callers. The lingua franca is the "epoch day": an integer count of calendar days since
// 1970-01-01. All schedule arithmetic (durations, fan-in max) is plain float math on epoch
// days, which is what lets 0.5d durations work (Temporal itself only adds whole days).

import { Temporal } from '@js-temporal/polyfill';

const EPOCH = Temporal.PlainDate.from('1970-01-01');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed, real YYYY-MM-DD date (rejects e.g. 2026-13-40). */
export function isValidDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  try {
    Temporal.PlainDate.from(s, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

/** Integer days from 1970-01-01 (negative before it). Assumes a valid date string. */
export function toEpochDay(dateStr: string): number {
  return EPOCH.until(Temporal.PlainDate.from(dateStr), { largestUnit: 'days' }).days;
}

/** Inverse of toEpochDay. Fractional input is truncated to the containing calendar day. */
export function fromEpochDay(day: number): string {
  return EPOCH.add({ days: Math.trunc(day) }).toString();
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function dayOfWeek(epochDay: number): number {
  return EPOCH.add({ days: Math.trunc(epochDay) }).dayOfWeek;
}

/** Saturday or Sunday. */
export function isWeekend(epochDay: number): boolean {
  const d = dayOfWeek(epochDay);
  return d === 6 || d === 7;
}

/** First-of-month? (used for month tick generation). */
export function isFirstOfMonth(epochDay: number): boolean {
  return EPOCH.add({ days: Math.trunc(epochDay) }).day === 1;
}

/** Duration must be a non-negative multiple of 0.5 (0d allowed for milestones). */
export function isValidDuration(d: number): boolean {
  return Number.isFinite(d) && d >= 0 && Math.round(d * 2) === d * 2;
}

/** A calendar-day label like "Sep 14" for a given epoch day. */
export function formatDayLabel(epochDay: number): string {
  const d = EPOCH.add({ days: Math.trunc(epochDay) });
  return `${MONTHS[d.month - 1]} ${d.day}`;
}

/** A month label like "Sep 2026" for a given epoch day. */
export function formatMonthLabel(epochDay: number): string {
  const d = EPOCH.add({ days: Math.trunc(epochDay) });
  return `${MONTHS[d.month - 1]} ${d.year}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
