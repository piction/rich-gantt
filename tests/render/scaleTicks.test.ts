import { describe, it, expect } from 'vitest';
import { dayToX, xToDay } from '../../src/render/scale';
import { generateTicks } from '../../src/render/ticks';
import { toEpochDay } from '../../src/compute/dateMath';

describe('scale', () => {
  it('dayToX and xToDay are inverses', () => {
    const t0 = toEpochDay('2026-09-14');
    const px = 40;
    for (const day of [t0, t0 + 3, t0 + 7.5, t0 + 30]) {
      expect(xToDay(dayToX(day, t0, px), t0, px)).toBeCloseTo(day, 9);
    }
  });
  it('origin maps to x=0', () => {
    const t0 = toEpochDay('2026-09-14');
    expect(dayToX(t0, t0, 22)).toBe(0);
  });

  it('compresses weekend days by weekendDayScale (t0 = Monday)', () => {
    const t0 = toEpochDay('2026-09-14'); // Monday
    const px = 10;
    const w = 0.5;
    // Mon..Fri (5 weekdays) then Sat+Sun (2 weekend days) → reaching the next Monday.
    // Effective width = (5 + 2*w) day-units.
    expect(dayToX(t0 + 7, t0, px, w)).toBeCloseTo((5 + 2 * w) * px, 9);
    // A fully-collapsed weekend (w=0) makes the following Monday sit exactly 5 weekdays out.
    expect(dayToX(t0 + 7, t0, px, 0)).toBeCloseTo(5 * px, 9);
  });

  it('dayToX/xToDay stay inverses under weekend compression', () => {
    const t0 = toEpochDay('2026-09-14');
    const px = 40;
    const w = 1 / 6; // the "2-day weekend ≈ 1/3 day" preset
    for (const day of [t0, t0 + 3, t0 + 5.5, t0 + 7, t0 + 12.5, t0 + 21]) {
      expect(xToDay(dayToX(day, t0, px, w), t0, px, w)).toBeCloseTo(day, 9);
    }
  });
});

describe('ticks', () => {
  const t0 = toEpochDay('2026-09-14'); // Monday
  const t1 = toEpochDay('2026-10-05');

  it('day level: one tick per day', () => {
    const ticks = generateTicks(t0, t1, 'day');
    expect(ticks.length).toBe(t1 - t0 + 1);
  });

  it('week level: ticks land on Mondays', () => {
    const ticks = generateTicks(t0, t1, 'week');
    expect(ticks[0].day).toBe(t0); // 2026-09-14 is a Monday
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].day - ticks[i - 1].day).toBe(7);
    }
  });

  it('month level: ticks land on the 1st', () => {
    const ticks = generateTicks(t0, t1, 'month');
    expect(ticks.length).toBe(1); // only 2026-10-01 falls in range
    expect(ticks[0].label).toBe('Oct 2026');
    expect(ticks[0].day).toBe(toEpochDay('2026-10-01'));
  });
});
