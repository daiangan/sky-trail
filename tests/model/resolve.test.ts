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

  it('correctly calculates Pleiades in the East when DATE-OBS lacks a trailing Z', () => {
    // Pleiades (M45): RA ~56.85 deg, Dec ~24.12 deg
    // Observed from Santo Domingo (lat 18.5144, lon -69.978) at 01:00 AM local (05:00 UTC)
    const pleiadesLight: LightFrame = {
      path: '/pleiades.fits',
      dateObs: '2026-09-19T05:00:00.000', // Standard FITS UTC without 'Z'
      exptime: 120,
      filterName: 'L',
      sizeBytes: 1_000_000,
      objRaDeg: 56.85,
      objDecDeg: 24.12,
      siteLatDeg: 18.5144,
      siteLonDeg: -69.978,
      altDeg: null,
      azDeg: null,
    };

    // Use default astronomy-engine AltAz calculator
    const result = resolveLightPosition(pleiadesLight, NULL_FALLBACK);

    expect(result.altDeg).not.toBeNull();
    expect(result.azDeg).not.toBeNull();
    // In reality at 05:00 UTC: Alt ~39.9 deg, Az ~73.6 deg (East is ~90 deg)
    // If the local-time bug were present, Az would be ~314 deg (Northwest/West)
    expect(result.azDeg!).toBeGreaterThan(60);
    expect(result.azDeg!).toBeLessThan(90);
    expect(result.altDeg!).toBeGreaterThan(30);
    expect(result.altDeg!).toBeLessThan(50);
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
