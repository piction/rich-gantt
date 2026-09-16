import { describe, it, expect } from 'vitest';
import {
  isValidDateString,
  toEpochDay,
  fromEpochDay,
  dayOfWeek,
  isWeekend,
  isFirstOfMonth,
  isValidDuration,
} from '../../src/compute/dateMath';

describe('isValidDateString', () => {
  it('accepts well-formed real dates', () => {
    expect(isValidDateString('2026-09-14')).toBe(true);
    expect(isValidDateString('1970-01-01')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2026-9-14')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('epoch day round-trip', () => {
  it('toEpochDay/fromEpochDay are inverse for whole days', () => {
    for (const s of ['1970-01-01', '2026-09-14', '2000-02-29']) {
      expect(fromEpochDay(toEpochDay(s))).toBe(s);
    }
  });
  it('epoch is day 0 and advances by one per day', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    expect(toEpochDay('1970-01-02')).toBe(1);
    expect(toEpochDay('2026-09-15') - toEpochDay('2026-09-14')).toBe(1);
  });
  it('fromEpochDay truncates fractional days to the containing day', () => {
    const base = toEpochDay('2026-09-14');
    expect(fromEpochDay(base + 0.5)).toBe('2026-09-14');
  });
});

describe('weekday helpers', () => {
  it('dayOfWeek is ISO (Mon=1..Sun=7)', () => {
    // 2026-09-14 is a Monday.
    expect(dayOfWeek(toEpochDay('2026-09-14'))).toBe(1);
    expect(dayOfWeek(toEpochDay('2026-09-19'))).toBe(6); // Saturday
    expect(dayOfWeek(toEpochDay('2026-09-20'))).toBe(7); // Sunday
  });
  it('isWeekend flags Sat/Sun only', () => {
    expect(isWeekend(toEpochDay('2026-09-18'))).toBe(false); // Friday
    expect(isWeekend(toEpochDay('2026-09-19'))).toBe(true);
    expect(isWeekend(toEpochDay('2026-09-20'))).toBe(true);
    expect(isWeekend(toEpochDay('2026-09-21'))).toBe(false); // Monday
  });
  it('isFirstOfMonth', () => {
    expect(isFirstOfMonth(toEpochDay('2026-10-01'))).toBe(true);
    expect(isFirstOfMonth(toEpochDay('2026-10-02'))).toBe(false);
  });
});

describe('isValidDuration', () => {
  it('accepts non-negative multiples of 0.5', () => {
    expect(isValidDuration(0)).toBe(true);
    expect(isValidDuration(0.5)).toBe(true);
    expect(isValidDuration(3)).toBe(true);
    expect(isValidDuration(7.5)).toBe(true);
  });
  it('rejects finer granularity and negatives', () => {
    expect(isValidDuration(0.25)).toBe(false);
    expect(isValidDuration(-1)).toBe(false);
    expect(isValidDuration(NaN)).toBe(false);
  });
});
