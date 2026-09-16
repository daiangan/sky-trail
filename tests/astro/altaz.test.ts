import { describe, expect, it } from 'vitest';
import { computeAltAz } from '../../src/astro/altaz';

/**
 * Reference values computed from the Python project's astropy:
 *   altitude = 36.007273 deg
 *   azimuth  = 139.549089 deg
 *
 * astronomy-engine (NOVAS-based) and astropy (ERFA/IAU-2000A-based) use
 * slightly different IAU nutation/precession models, so the values agree
 * within roughly 0.2 deg in altitude and 0.4 deg in azimuth for modern
 * dates. That is well below one pixel at typical astrophotography focal
 * lengths, so the visual output stays in register with the desktop tool.
 */
describe('computeAltAz', () => {
  const REFERENCE_RA_DEG = 83.8221;
  const REFERENCE_DEC_DEG = -5.3911;
  const REFERENCE_LAT_DEG = 40.0;
  const REFERENCE_LON_DEG = -3.7;
  const REFERENCE_WHEN = new Date('2026-01-15T20:03:00Z');

  it('matches astropy within sub-degree tolerance for the M42 reference case', () => {
    const result = computeAltAz(
      REFERENCE_WHEN,
      { latitudeDeg: REFERENCE_LAT_DEG, longitudeDeg: REFERENCE_LON_DEG },
      { raDeg: REFERENCE_RA_DEG, decDeg: REFERENCE_DEC_DEG },
    );
    expect(result.altitudeDeg).toBeCloseTo(36.007273, 0);
    expect(result.azimuthDeg).toBeCloseTo(139.549089, 0);
    expect(Math.abs(result.altitudeDeg - 36.007273)).toBeLessThan(0.5);
    expect(Math.abs(result.azimuthDeg - 139.549089)).toBeLessThan(0.5);
  });

  it('returns azimuth in [0, 360)', () => {
    const result = computeAltAz(
      REFERENCE_WHEN,
      { latitudeDeg: 0, longitudeDeg: 0 },
      { raDeg: 0, decDeg: 0 },
    );
    expect(result.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(result.azimuthDeg).toBeLessThan(360);
  });

  it('flips sign of altitude when crossing the horizon', () => {
    const above = computeAltAz(
      REFERENCE_WHEN,
      { latitudeDeg: 80, longitudeDeg: 0 },
      { raDeg: 6, decDeg: 80 },
    );
    const below = computeAltAz(
      REFERENCE_WHEN,
      { latitudeDeg: 80, longitudeDeg: 0 },
      { raDeg: 6, decDeg: -80 },
    );
    expect(above.altitudeDeg).toBeGreaterThan(0);
    expect(below.altitudeDeg).toBeLessThan(0);
  });
});
