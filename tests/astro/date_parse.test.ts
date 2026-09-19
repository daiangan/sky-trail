import { describe, expect, it } from 'vitest';
import { parseFitsDate } from '../../src/astro/date_parse';

describe('parseFitsDate', () => {
  it('parses ISO string without Z as UTC (not local time)', () => {
    const result = parseFitsDate('2026-09-15T06:21:38.882');
    expect(result).not.toBeNull();
    // In UTC, hours must be exactly 6, minutes 21, seconds 38
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(8); // 0-indexed, September = 8
    expect(result!.getUTCDate()).toBe(15);
    expect(result!.getUTCHours()).toBe(6);
    expect(result!.getUTCMinutes()).toBe(21);
    expect(result!.getUTCSeconds()).toBe(38);
    expect(result!.getUTCMilliseconds()).toBe(882);
  });

  it('parses space-separated date/time as UTC', () => {
    const result = parseFitsDate('2026-09-15 06:21:38');
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCHours()).toBe(6);
    expect(result!.getUTCMinutes()).toBe(21);
    expect(result!.getUTCSeconds()).toBe(38);
  });

  it('preserves existing Z suffix', () => {
    const result = parseFitsDate('2026-09-15T06:21:38Z');
    expect(result).not.toBeNull();
    expect(result!.getUTCHours()).toBe(6);
    expect(result!.toISOString()).toBe('2026-09-15T06:21:38.000Z');
  });

  it('honours explicit timezone offset when present', () => {
    const result = parseFitsDate('2026-09-15T02:21:38-04:00');
    expect(result).not.toBeNull();
    // 02:21 -04:00 is 06:21 UTC
    expect(result!.getUTCHours()).toBe(6);
    expect(result!.getUTCMinutes()).toBe(21);
  });

  it('parses date-only string as UTC midnight', () => {
    const result = parseFitsDate('2026-09-15');
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(8);
    expect(result!.getUTCDate()).toBe(15);
    expect(result!.getUTCHours()).toBe(0);
  });

  it('returns null for null, empty, or invalid input', () => {
    expect(parseFitsDate(null)).toBeNull();
    expect(parseFitsDate(undefined)).toBeNull();
    expect(parseFitsDate('')).toBeNull();
    expect(parseFitsDate('    ')).toBeNull();
    expect(parseFitsDate('not-a-date')).toBeNull();
    expect(parseFitsDate('2026-99-99T99:99:99')).toBeNull();
  });
});
