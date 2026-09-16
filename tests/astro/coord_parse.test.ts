import { describe, expect, it } from 'vitest';
import {
  parseManualDec,
  parseManualLatitude,
  parseManualLongitude,
  parseManualRa,
} from '../../src/astro/coord_parse';

describe('parseManualRa', () => {
  it('parses colon-separated sexagesimal hours', () => {
    expect(parseManualRa('05:35:17.3')).toBeCloseTo(83.822, 2);
  });

  it('parses space-separated sexagesimal hours', () => {
    expect(parseManualRa('05 35 17.3')).toBeCloseTo(83.822, 2);
  });

  it('parses bare decimal degrees when no colon is present', () => {
    expect(parseManualRa('83.822')).toBeCloseTo(83.822, 3);
  });

  it('returns null for empty input', () => {
    expect(parseManualRa('')).toBeNull();
  });

  it('returns null for unparsable input', () => {
    expect(parseManualRa('hello')).toBeNull();
  });
});

describe('parseManualDec', () => {
  it('parses colon-separated sexagesimal degrees', () => {
    expect(parseManualDec('-05:23:28')).toBeCloseTo(-5.391, 2);
  });

  it('parses space-separated sexagesimal degrees', () => {
    expect(parseManualDec('-05 23 28')).toBeCloseTo(-5.391, 2);
  });

  it('parses bare decimal degrees when no colon is present', () => {
    expect(parseManualDec('-5.3911')).toBeCloseTo(-5.3911, 3);
  });

  it('parses the reference +61:16:05 declination from the real sample', () => {
    expect(parseManualDec('+61:16:05')).toBeCloseTo(61.2681, 3);
  });

  it('returns null for unparsable input', () => {
    expect(parseManualDec('not-a-coord')).toBeNull();
  });
});

describe('parseManualLatitude / parseManualLongitude', () => {
  it('parses signed decimal degrees', () => {
    expect(parseManualLatitude('18.5144444444444')).toBeCloseTo(18.5144, 4);
    expect(parseManualLatitude('-69.9781')).toBeCloseTo(-69.9781, 4);
    expect(parseManualLongitude('40.000000')).toBe(40.0);
    expect(parseManualLongitude('-3.700000')).toBe(-3.7);
  });

  it('returns null for unparsable input', () => {
    expect(parseManualLatitude('forty')).toBeNull();
    expect(parseManualLongitude('')).toBeNull();
  });
});
