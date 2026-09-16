import { describe, expect, it } from 'vitest';
import {
  DOME_MERIDIAN_COUNT,
  DOME_MERIDIAN_SAMPLES,
  DOME_RING_COUNT,
  DOME_RING_SAMPLES,
  buildDomeWireframe,
} from '../../src/render/dome_geometry';

describe('buildDomeWireframe', () => {
  it('emits 7 rings, 12 meridians', () => {
    expect(DOME_RING_COUNT).toBe(7);
    expect(DOME_MERIDIAN_COUNT).toBe(12);
  });

  it('matches the Python project: 72 samples per ring, 18 per meridian', () => {
    expect(DOME_RING_SAMPLES).toBe(72);
    expect(DOME_MERIDIAN_SAMPLES).toBe(18);
  });

  it('produces 708 line segments (504 rings + 204 meridians)', () => {
    const wf = buildDomeWireframe();
    expect(wf.ringSegments).toBe(7 * 72);
    expect(wf.meridianSegments).toBe(12 * 17);
    expect(wf.ringSegments + wf.meridianSegments).toBe(708);
    expect(wf.positions.length).toBe(708 * 2 * 3);
  });

  it('places all vertices on the dome surface (within rounding)', () => {
    const wf = buildDomeWireframe();
    const radius = 10;
    for (let i = 0; i < wf.positions.length; i += 3) {
      const x = wf.positions[i]!;
      const y = wf.positions[i + 1]!;
      const z = wf.positions[i + 2]!;
      const r = Math.hypot(x, y, z);
      expect(Math.abs(r - radius)).toBeLessThan(1e-4);
    }
  });

  it('every ring vertex is at the same altitude (z coordinate)', () => {
    const wf = buildDomeWireframe();
    // 72 ring vertices, each repeated 2x (line segment endpoints).
    // Walk the first ring (72 segments = 144 vertices).
    const firstRingZs: number[] = [];
    for (let i = 0; i < 72 * 2; i += 1) {
      firstRingZs.push(wf.positions[i * 3 + 2]!);
    }
    const firstZ = firstRingZs[0]!;
    for (const z of firstRingZs) {
      expect(z).toBeCloseTo(firstZ, 4);
    }
  });

  it('every meridian vertex sits at the same azimuth (x, y within expected ratio)', () => {
    const wf = buildDomeWireframe();
    // Meridians start after the rings: 7 * 72 * 2 * 3 = 3024 floats.
    const start = DOME_RING_COUNT * DOME_RING_SAMPLES * 2 * 3;
    const meridianCount = 17 * 2;
    const radius = 10;
    for (let m = 0; m < 12; m += 1) {
      const az = (m * 30 * Math.PI) / 180;
      const cosAz = Math.cos(az);
      const sinAz = Math.sin(az);
      for (let i = 0; i < meridianCount; i += 1) {
        const offset = start + (m * meridianCount + i) * 3;
        const x = wf.positions[offset]!;
        const y = wf.positions[offset + 1]!;
        // For meridian at azimuth `az`:
        //   x = R * cos(alt) * sin(az),  y = R * cos(alt) * cos(az)
        // Verify the ratio y/x matches cos(az)/sin(az) (skip when sinAz ~ 0).
        if (Math.abs(sinAz) < 1e-6) {
          expect(Math.abs(x)).toBeLessThan(1e-6);
        } else {
          const ratio = y / x;
          const expected = cosAz / sinAz;
          expect(Math.abs(ratio - expected)).toBeLessThan(1e-3);
        }
        // And every vertex on the meridian has the same cos(alt) factor:
        const cosAltFactor = Math.hypot(x, y) / radius;
        expect(cosAltFactor).toBeGreaterThanOrEqual(-1e-6);
        expect(cosAltFactor).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});
