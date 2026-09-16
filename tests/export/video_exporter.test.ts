import { describe, expect, it } from 'vitest';
import { snapToEven } from '../../src/export/video_exporter';

describe('snapToEven (the libx264 even-dimension guard from section 3.12)', () => {
  it('keeps already-even dimensions unchanged', () => {
    expect(snapToEven(220)).toBe(220);
    expect(snapToEven(540)).toBe(540);
    expect(snapToEven(2)).toBe(2);
  });

  it('rounds odd dimensions up to the next even integer', () => {
    expect(snapToEven(219)).toBe(220);
    expect(snapToEven(541)).toBe(542);
    expect(snapToEven(3)).toBe(4);
  });

  it('clamps 0/1 to the minimum even 2 (avoid zero-size canvas)', () => {
    expect(snapToEven(0)).toBe(2);
    expect(snapToEven(1)).toBe(2);
  });
});
