import { describe, expect, it } from 'vitest';
import { DOME_RADIUS, altAzToXyz, xyzToAltAz } from '../../src/render/coordinates';

describe('altAzToXyz', () => {
  it('places the north horizon point at +Y', () => {
    const v = altAzToXyz(0, 0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(DOME_RADIUS, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('places the east horizon point at +X', () => {
    const v = altAzToXyz(0, 90);
    expect(v.x).toBeCloseTo(DOME_RADIUS, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('places the south horizon point at -Y', () => {
    const v = altAzToXyz(0, 180);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(-DOME_RADIUS, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('places the west horizon point at -X', () => {
    const v = altAzToXyz(0, 270);
    expect(v.x).toBeCloseTo(-DOME_RADIUS, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('places the zenith straight up (+Z)', () => {
    const v = altAzToXyz(90, 0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(DOME_RADIUS, 6);
  });

  it('places the nadir straight down (-Z)', () => {
    const v = altAzToXyz(-90, 0);
    expect(v.z).toBeCloseTo(-DOME_RADIUS, 6);
  });

  it('honors a custom radius', () => {
    const v = altAzToXyz(0, 0, 25);
    expect(v.y).toBeCloseTo(25, 6);
  });

  it('round-trips through xyzToAltAz for the M42 reference position', () => {
    const altDeg = 36.007273;
    const azDeg = 139.549089;
    const v = altAzToXyz(altDeg, azDeg);
    const back = xyzToAltAz(v);
    expect(back.altitudeDeg).toBeCloseTo(altDeg, 4);
    expect(back.azimuthDeg).toBeCloseTo(azDeg, 4);
  });
});

describe('xyzToAltAz', () => {
  it('returns 0/0 for the origin (degenerate)', () => {
    expect(xyzToAltAz({ x: 0, y: 0, z: 0 })).toEqual({ altitudeDeg: 0, azimuthDeg: 0 });
  });

  it('normalizes azimuth into [0, 360)', () => {
    const result = xyzToAltAz({ x: 0, y: -10, z: 0 });
    expect(result.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(result.azimuthDeg).toBeLessThan(360);
    expect(result.azimuthDeg).toBeCloseTo(180, 6);
  });
});
