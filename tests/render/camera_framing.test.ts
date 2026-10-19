import { describe, expect, it } from 'vitest';
import { DOME_TARGET_HEIGHT_RATIO, computeDomeFraming } from '../../src/render/camera_framing';

const base = { radius: 10, verticalFovDeg: 45 };

describe('computeDomeFraming', () => {
  it('aims at the dome visual centre, above the horizon plane', () => {
    const { targetY } = computeDomeFraming({ ...base, aspect: 1.5 });
    expect(targetY).toBeCloseTo(10 * DOME_TARGET_HEIGHT_RATIO, 10);
    expect(targetY).toBeGreaterThan(0);
    expect(targetY).toBeLessThan(10);
  });

  it('keeps the whole dome in view for any aspect ratio', () => {
    for (const aspect of [0.4, 0.75, 1, 1.6, 2.4]) {
      const { targetY, distance } = computeDomeFraming({ ...base, aspect });
      const verticalHalf = (base.verticalFovDeg * Math.PI) / 360;
      const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);
      const rim = Math.hypot(10, targetY);
      // The farthest dome point must fit inside the narrower half-angle.
      expect(rim / distance).toBeLessThanOrEqual(Math.sin(Math.min(verticalHalf, horizontalHalf)));
    }
  });

  it('moves the camera back as the canvas gets narrower', () => {
    const wide = computeDomeFraming({ ...base, aspect: 1.6 }).distance;
    const narrow = computeDomeFraming({ ...base, aspect: 0.5 }).distance;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('scales with the dome radius', () => {
    const small = computeDomeFraming({ radius: 5, verticalFovDeg: 45, aspect: 1 });
    const large = computeDomeFraming({ radius: 10, verticalFovDeg: 45, aspect: 1 });
    expect(large.distance).toBeCloseTo(small.distance * 2, 8);
    expect(large.targetY).toBeCloseTo(small.targetY * 2, 8);
  });

  it('adds more room with a larger margin', () => {
    const tight = computeDomeFraming({ ...base, aspect: 1, margin: 1.05 }).distance;
    const loose = computeDomeFraming({ ...base, aspect: 1, margin: 1.4 }).distance;
    expect(loose).toBeGreaterThan(tight);
  });

  it('does not blow up for a degenerate aspect ratio', () => {
    const { distance } = computeDomeFraming({ ...base, aspect: 0 });
    expect(Number.isFinite(distance)).toBe(true);
  });
});
