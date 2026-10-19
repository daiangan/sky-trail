import { describe, expect, it } from 'vitest';
import type { LightFrame } from '../../src/model/light_frame';
import { addSession, createProject } from '../../src/model/project';
import { addLight, createSession } from '../../src/model/session';
import {
  buildTimeline,
  formatDuration,
  formatDataSize,
  type AltAzFn,
} from '../../src/model/timeline';

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

  it('orders by the parsed instant when DATE-OBS spellings are mixed', () => {
    // As plain text these sort wrongly: ' ' < 'T', and an offset or 'Z' changes the instant.
    const frames = [
      light(0, { path: '/space.fits', dateObs: '2026-01-01 20:00:00' }), // 20:00:00Z
      light(1, { path: '/naive.fits', dateObs: '2026-01-01T19:59:30' }), // 19:59:30Z
      light(2, { path: '/offset.fits', dateObs: '2026-01-01T20:30:00+01:00' }), // 19:30:00Z
      light(3, { path: '/fraction.fits', dateObs: '2026-01-01T20:00:00.500Z' }), // 20:00:00.5Z
    ];
    let session = createSession(0);
    for (const frame of frames) session = addLight(session, frame);
    const project = addSession(createProject(), session);

    const order = buildTimeline(project, PASS_THROUGH_ALTAZ).map((point) => point.light.path);
    expect(order).toEqual(['/offset.fits', '/naive.fits', '/space.fits', '/fraction.fits']);
  });

  it('keeps assignment order for frames with the same instant', () => {
    let session = createSession(0);
    session = addLight(session, light(0, { path: '/a.fits', dateObs: '2026-01-01T20:00:00Z' }));
    session = addLight(session, light(1, { path: '/b.fits', dateObs: '2026-01-01 20:00:00' }));
    const project = addSession(createProject(), session);

    const order = buildTimeline(project, PASS_THROUGH_ALTAZ).map((point) => point.light.path);
    expect(order).toEqual(['/a.fits', '/b.fits']);
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

describe('formatDataSize', () => {
  it('formats a gibibyte or more in GB with two decimals', () => {
    expect(formatDataSize(1024 ** 3)).toBe('1.00 GB');
    expect(formatDataSize(1.43 * 1024 ** 3)).toBe('1.43 GB');
  });

  it('switches to MB, KB and B instead of showing 0.00 GB for small totals', () => {
    expect(formatDataSize(1024 ** 3 / 2)).toBe('512.0 MB');
    expect(formatDataSize(100 * 1024 ** 2)).toBe('100.0 MB');
    expect(formatDataSize(60 * 2880)).toBe('168.8 KB');
    expect(formatDataSize(500)).toBe('500 B');
    expect(formatDataSize(0)).toBe('0 B');
  });

  it('moves to the next unit when rounding would show 1024', () => {
    expect(formatDataSize(1024 ** 2 - 1)).toBe('1.0 MB');
    expect(formatDataSize(1024 ** 3 - 1)).toBe('1.00 GB');
  });

  it('keeps counting in GB for very large totals', () => {
    expect(formatDataSize(2048 * 1024 ** 3)).toBe('2048.00 GB');
  });

  it('returns "0 B" for non-finite or negative input', () => {
    expect(formatDataSize(-1)).toBe('0 B');
    expect(formatDataSize(Number.NaN)).toBe('0 B');
  });
});
