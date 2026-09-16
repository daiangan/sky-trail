import { describe, expect, it } from 'vitest';
import { parseFitsHeader } from '../../src/fits/header';
import { extractLightMetadata } from '../../src/fits/extract';
import { buildFitsBuffer } from './_helpers';

const REFERENCE_CARDS: Array<[string, string | number]> = [
  ['DATE-OBS', '2026-01-15T20:03:00'],
  ['EXPTIME', 180.0],
  ['FILTER', 'L'],
  ['OBJCTRA', '05 35 17.3'],
  ['OBJCTDEC', '-05 23 28'],
  ['SITELAT', '40.000000'],
  ['SITELONG', '-3.700000'],
];

describe('extractLightMetadata', () => {
  it('reproduces the reference section 3.1 values within tolerance', () => {
    const header = parseFitsHeader(buildFitsBuffer(REFERENCE_CARDS));
    const meta = extractLightMetadata(header);

    expect(meta.dateObs).toBe('2026-01-15T20:03:00');
    expect(meta.exptime).toBe(180.0);
    expect(meta.filterName).toBe('L');
    expect(meta.objRaDeg).toBeCloseTo(83.822, 2);
    expect(meta.objDecDeg).toBeCloseTo(-5.391, 2);
    expect(meta.siteLatDeg).toBe(40.0);
    expect(meta.siteLonDeg).toBe(-3.7);
  });

  it('returns null for any missing or unparsable keyword', () => {
    const header = parseFitsHeader(buildFitsBuffer([['EXPTIME', 60.0]]));
    const meta = extractLightMetadata(header);

    expect(meta.exptime).toBe(60.0);
    expect(meta.dateObs).toBeNull();
    expect(meta.filterName).toBeNull();
    expect(meta.objRaDeg).toBeNull();
    expect(meta.objDecDeg).toBeNull();
    expect(meta.siteLatDeg).toBeNull();
    expect(meta.siteLonDeg).toBeNull();
  });

  it('preserves the high-precision site coordinates from real acquisition software', () => {
    const header = parseFitsHeader(
      buildFitsBuffer([
        ['SITELAT', '18.5144444444444'],
        ['SITELONG', '-69.9780555555556'],
        ['OBJCTRA', '02 34 34'],
        ['OBJCTDEC', '+61 16 05'],
        ['FILTER', 'SV220'],
        ['DATE-OBS', '2026-09-15T06:21:38.8822612'],
        ['EXPTIME', 240.0],
      ]),
    );
    const meta = extractLightMetadata(header);

    expect(meta.siteLatDeg).toBeCloseTo(18.5144, 4);
    expect(meta.siteLonDeg).toBeCloseTo(-69.9781, 4);
    expect(meta.objRaDeg).toBeCloseTo(38.6417, 3);
    expect(meta.objDecDeg).toBeCloseTo(61.2681, 3);
    expect(meta.filterName).toBe('SV220');
    expect(meta.dateObs).toBe('2026-09-15T06:21:38.8822612');
    expect(meta.exptime).toBe(240.0);
  });

  it('falls back to decimal parsing when OBJCTRA / OBJCTDEC are written in degrees', () => {
    const header = parseFitsHeader(
      buildFitsBuffer([
        ['OBJCTRA', '83.8221'],
        ['OBJCTDEC', '-5.3911'],
      ]),
    );
    const meta = extractLightMetadata(header);
    expect(meta.objRaDeg).toBeCloseTo(83.8221 * 15, 3);
    expect(meta.objDecDeg).toBeCloseTo(-5.3911, 3);
  });

  it('trims whitespace from string values', () => {
    const header = parseFitsHeader(buildFitsBuffer([['FILTER', '  Ha  ']]));
    const meta = extractLightMetadata(header);
    expect(meta.filterName).toBe('Ha');
  });
});
