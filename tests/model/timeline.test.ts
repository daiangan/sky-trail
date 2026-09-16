import { describe, expect, it } from 'vitest';
import type { LightFrame } from '../../src/model/light_frame';
import { addSession, createProject } from '../../src/model/project';
import { addLight, createSession } from '../../src/model/session';
import { buildTimeline, formatDuration, formatGb, type AltAzFn } from '../../src/model/timeline';

function light(minute: number, overrides: Partial<LightFrame> = {}): LightFrame {
  return {
    path: `/${minute}.fits`,
    dateObs: `2026-01-01T20:${String(minute).padStart(2, '0')}:00Z`,
    exptime: 60,
    filterName: 'L',
    sizeBytes: 1_000_000,
    objRaDeg: 10,
    objDecDeg: 10,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: 10,
    azDeg: 20,
    ...overrides,
  };
}

const PASS_THROUGH_ALTAZ: AltAzFn = () => ({ altitudeDeg: 10, azimuthDeg: 20 });

describe('buildTimeline', () => {
  it('orders by DATE-OBS ascending across sessions, not by assignment order', () => {
    let s1 = createSession(0);
    s1 = addLight(s1, light(5));
    s1 = addLight(s1, light(0));
    let s2 = createSession(1);
    s2 = addLight(s2, light(10));
    let p = createProject();
    p = addSession(p, s1);
    p = addSession(p, s2);

    const points = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(points).toHaveLength(3);
    expect(points[0]?.light.dateObs).toBe('2026-01-01T20:00:00Z');
    expect(points[1]?.light.dateObs).toBe('2026-01-01T20:05:00Z');
    expect(points[2]?.light.dateObs).toBe('2026-01-01T20:10:00Z');
  });

  it('accumulates exptime, subframes, and bytes', () => {
    let s1 = createSession(0);
    s1 = addLight(s1, light(0, { exptime: 60, sizeBytes: 1_000_000 }));
    s1 = addLight(s1, light(1, { exptime: 120, sizeBytes: 2_000_000 }));
    s1 = addLight(s1, light(2, { exptime: 180, sizeBytes: 3_000_000 }));
    let p = createProject();
    p = addSession(p, s1);

    const points = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(points[0]?.cumulativeExptimeS).toBe(60);
    expect(points[1]?.cumulativeExptimeS).toBe(180);
    expect(points[2]?.cumulativeExptimeS).toBe(360);
    expect(points.map((p) => p.cumulativeSubframes)).toEqual([1, 2, 3]);
    expect(points.map((p) => p.cumulativeBytes)).toEqual([1_000_000, 3_000_000, 6_000_000]);
  });

  it('excludes lights that cannot be positioned (no coords, no fallback)', () => {
    let s = createSession(0);
    s = addLight(s, light(0));
    s = addLight(
      s,
      light(1, { objRaDeg: null, objDecDeg: null, siteLatDeg: null, siteLonDeg: null }),
    );
    let p = createProject();
    p = addSession(p, s);

    const points = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(points).toHaveLength(1);
    expect(points[0]?.light.dateObs).toBe('2026-01-01T20:00:00Z');
  });

  it('records 1-based night_index and total_nights on every point', () => {
    let s1 = createSession(0);
    s1 = addLight(s1, light(0));
    let s2 = createSession(1);
    s2 = addLight(s2, light(1));
    let p = createProject();
    p = addSession(p, s1);
    p = addSession(p, s2);

    const points = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(points[0]?.nightIndex).toBe(1);
    expect(points[1]?.nightIndex).toBe(2);
    expect(points.every((pt) => pt.totalNights === 2)).toBe(true);
  });

  it('treats null exptime as zero in the cumulative total', () => {
    let s = createSession(0);
    s = addLight(s, light(0, { exptime: 60 }));
    s = addLight(s, light(1, { exptime: null }));
    let p = createProject();
    p = addSession(p, s);

    const points = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(points[1]?.cumulativeExptimeS).toBe(60);
  });

  it('produces the same pre-computed list for live preview and exporter', () => {
    let s = createSession(0);
    s = addLight(s, light(0));
    s = addLight(s, light(1));
    let p = createProject();
    p = addSession(p, s);

    const a = buildTimeline(p, PASS_THROUGH_ALTAZ);
    const b = buildTimeline(p, PASS_THROUGH_ALTAZ);
    expect(a).toEqual(b);
  });
});

describe('formatDuration', () => {
  it('formats whole hours and zero-padded minutes', () => {
    expect(formatDuration(3600)).toBe('1h 00m');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(0)).toBe('0h 00m');
  });

  it('rounds the total seconds before truncating to minutes', () => {
    expect(formatDuration(0)).toBe('0h 00m');
    expect(formatDuration(59)).toBe('0h 00m');
    expect(formatDuration(60)).toBe('0h 01m');
    expect(formatDuration(3599.6)).toBe('1h 00m');
    expect(formatDuration(5459.5)).toBe('1h 31m');
  });

  it('handles sub-hour values', () => {
    expect(formatDuration(300)).toBe('0h 05m');
    expect(formatDuration(60)).toBe('0h 01m');
  });

  it('clamps negative input to zero', () => {
    expect(formatDuration(-100)).toBe('0h 00m');
  });
});

describe('formatGb', () => {
  it('formats one gibibyte with two decimals', () => {
    expect(formatGb(1024 ** 3)).toBe('1.00 GB');
  });

  it('formats sub-GB values with two decimals (no MB/KB fallback)', () => {
    // 512 MiB is exactly 0.5 GB; avoids rounding ambiguity at .48/.49.
    expect(formatGb(1024 ** 3 / 2)).toBe('0.50 GB');
    expect(formatGb(100 * 1024 ** 2)).toBe('0.10 GB');
  });

  it('returns "0.00 GB" for non-finite or negative input', () => {
    expect(formatGb(-1)).toBe('0.00 GB');
    expect(formatGb(Number.NaN)).toBe('0.00 GB');
  });
});
