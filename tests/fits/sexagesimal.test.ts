import { describe, expect, it } from 'vitest';
import { parseDecimalDegrees, parseSexagesimal } from '../../src/fits/sexagesimal';

describe('parseSexagesimal', () => {
  it('parses the reference OBJCTRA value', () => {
    expect(parseSexagesimal('05 35 17.3', 'hours')).toBeCloseTo(83.822, 2);
  });

  it('parses the reference OBJCTDEC value', () => {
    expect(parseSexagesimal('-05 23 28', 'degrees')).toBeCloseTo(-5.391, 2);
  });

  it('honours an explicit + sign on declination', () => {
    expect(parseSexagesimal('+61 16 05', 'degrees')).toBeCloseTo(61.2681, 3);
  });

  it('accepts integer seconds with no decimal fraction', () => {
    expect(parseSexagesimal('02 34 34', 'hours')).toBeCloseTo(38.6417, 3);
  });

  it('treats two-part input as degrees/minutes', () => {
    expect(parseSexagesimal('-05 23', 'degrees')).toBeCloseTo(-5.3833, 3);
  });

  it('accepts colon-separated components', () => {
    expect(parseSexagesimal('05:35:17.3', 'hours')).toBeCloseTo(83.822, 2);
  });

  it('returns null for empty input', () => {
    expect(parseSexagesimal('', 'hours')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseSexagesimal('   ', 'degrees')).toBeNull();
  });

  it('returns null for non-numeric components', () => {
    expect(parseSexagesimal('ab cd ef', 'hours')).toBeNull();
  });

  it('ignores components past the third (extra-precision tolerance)', () => {
    expect(parseSexagesimal('05 35 17 99', 'hours')).toBeCloseTo(83.822, 2);
  });
});

describe('parseDecimalDegrees', () => {
  it('parses the reference SITELAT value', () => {
    expect(parseDecimalDegrees('40.000000')).toBe(40.0);
  });

  it('parses the reference SITELONG value', () => {
    expect(parseDecimalDegrees('-3.700000')).toBe(-3.7);
  });

  it('preserves high-precision values from real acquisition software', () => {
    expect(parseDecimalDegrees('18.5144444444444')).toBeCloseTo(18.5144, 4);
    expect(parseDecimalDegrees('-69.9780555555556')).toBeCloseTo(-69.9781, 4);
  });

  it('returns null for empty input', () => {
    expect(parseDecimalDegrees('')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseDecimalDegrees('forty')).toBeNull();
  });
});
