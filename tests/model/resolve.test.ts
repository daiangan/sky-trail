import { describe, expect, it } from 'vitest';
import type { LightFrame } from '../../src/model/light_frame';
import { hasPosition } from '../../src/model/light_frame';
import {
  projectFallback,
  resolveLightPosition,
  type AltAzFn,
  type FallbackCoordinates,
} from '../../src/model/resolve';

const NULL_FALLBACK: FallbackCoordinates = {
  raDeg: null,
  decDeg: null,
  latDeg: null,
  lonDeg: null,
};

const PASS_THROUGH_ALTAZ: AltAzFn = (_when, observer, target) => ({
  altitudeDeg: observer.latitudeDeg + target.decDeg,
  azimuthDeg: target.raDeg - observer.longitudeDeg,
});

function light(overrides: Partial<LightFrame> = {}): LightFrame {
  return {
    path: '/fake.fits',
    dateObs: '2026-01-15T20:03:00Z',
    exptime: 60,
    filterName: 'L',
    sizeBytes: 1_000_000,
    objRaDeg: 10,
    objDecDeg: 10,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: null,
    azDeg: null,
    ...overrides,
  };
}

describe('resolveLightPosition', () => {
  it('fills missing RA/Dec/Lat/Lon from project fallback', () => {
    const result = resolveLightPosition(
      light({ objRaDeg: null, objDecDeg: null, siteLonDeg: -3.7 }),
      { raDeg: 83.82, decDeg: -5.39, latDeg: 40, lonDeg: -3.7 },
      PASS_THROUGH_ALTAZ,
    );
    expect(result.objRaDeg).toBe(83.82);
    expect(result.objDecDeg).toBe(-5.39);
    expect(result.siteLatDeg).toBe(40);
    expect(result.siteLonDeg).toBe(-3.7);
    expect(result.altDeg).toBeCloseTo(40 + -5.39);
    expect(result.azDeg).toBeCloseTo(83.82 - -3.7);
  });

  it('prefers the light header value over the fallback when both are present', () => {
    const result = resolveLightPosition(
      light({ objRaDeg: 12, siteLatDeg: 0, siteLonDeg: 0 }),
      { raDeg: 99, decDeg: 5, latDeg: 0, lonDeg: 0 },
      PASS_THROUGH_ALTAZ,
    );
    expect(result.objRaDeg).toBe(12);
    expect(result.azDeg).toBeCloseTo(12 - 0);
  });

  it('returns null alt/az when any required field remains null', () => {
    const result = resolveLightPosition(
      light({ objRaDeg: null }),
      NULL_FALLBACK,
      PASS_THROUGH_ALTAZ,
    );
    expect(hasPosition(result)).toBe(false);
    expect(result.altDeg).toBeNull();
    expect(result.azDeg).toBeNull();
  });

  it('returns null alt/az when DATE-OBS is missing', () => {
    const result = resolveLightPosition(
      light({ dateObs: null }),
      NULL_FALLBACK,
      PASS_THROUGH_ALTAZ,
    );
    expect(hasPosition(result)).toBe(false);
  });

  it('returns null alt/az when DATE-OBS is not a valid date', () => {
    const result = resolveLightPosition(
      light({ dateObs: 'not a date' }),
      NULL_FALLBACK,
      PASS_THROUGH_ALTAZ,
    );
    expect(hasPosition(result)).toBe(false);
  });

  it('returns the input reference fields unchanged on success', () => {
    const src = light();
    const result = resolveLightPosition(src, NULL_FALLBACK, PASS_THROUGH_ALTAZ);
    expect(result.path).toBe(src.path);
    expect(result.dateObs).toBe(src.dateObs);
    expect(result.exptime).toBe(src.exptime);
    expect(result.filterName).toBe(src.filterName);
    expect(result.sizeBytes).toBe(src.sizeBytes);
  });
});

describe('projectFallback', () => {
  it('extracts the four fallback fields from a project', () => {
    const fb = projectFallback({
      fallbackObjRaDeg: 83.82,
      fallbackObjDecDeg: -5.39,
      fallbackSiteLatDeg: 40,
      fallbackSiteLonDeg: -3.7,
    });
    expect(fb).toEqual({ raDeg: 83.82, decDeg: -5.39, latDeg: 40, lonDeg: -3.7 });
  });
});
