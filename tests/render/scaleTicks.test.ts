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
