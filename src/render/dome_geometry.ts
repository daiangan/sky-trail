/**
 * Wireframe hemisphere geometry, matching the Python project's
 * `render.dome_geometry.build_dome_wireframe`:
 *   - 7 altitude rings (alt = 0, 15, 30, 45, 60, 75, 90 deg), each
 *     sampled at 72 azimuth points and closed back to the start
 *   - 12 azimuth meridians (az = 0, 30, 60, ..., 330 deg), each
 *     sampled at 18 altitude points from horizon to zenith
 *
 * Returns a Float32Array of vertex positions suitable for
 * THREE.BufferGeometry's `position` attribute when paired with a
 * LineSegments draw mode (each pair of consecutive vertices forms one
 * line segment).
 */

import { DOME_RADIUS, altAzToXyz } from './coordinates';

export const DOME_ALT_STEP_DEG = 15;
export const DOME_AZ_STEP_DEG = 30;
export const DOME_RING_SAMPLES = 72;
export const DOME_MERIDIAN_SAMPLES = 18;

export const DOME_RING_COUNT = Math.floor(90 / DOME_ALT_STEP_DEG) + 1;
export const DOME_MERIDIAN_COUNT = Math.floor(360 / DOME_AZ_STEP_DEG);

export interface DomeWireframe {
  positions: Float32Array;
  ringSegments: number;
  meridianSegments: number;
}

export function buildDomeWireframe(radius: number = DOME_RADIUS): DomeWireframe {
  const ringSegments = DOME_RING_COUNT * DOME_RING_SAMPLES;
  const meridianSegments = DOME_MERIDIAN_COUNT * (DOME_MERIDIAN_SAMPLES - 1);
  const totalSegments = ringSegments + meridianSegments;
  const positions = new Float32Array(totalSegments * 2 * 3);

  let cursor = 0;

  for (let altIdx = 0; altIdx < DOME_RING_COUNT; altIdx += 1) {
    const alt = altIdx * DOME_ALT_STEP_DEG;
    for (let i = 0; i < DOME_RING_SAMPLES; i += 1) {
      const az1 = (i / DOME_RING_SAMPLES) * 360;
      const az2 = ((i + 1) / DOME_RING_SAMPLES) * 360;
      cursor = writeSegment(positions, cursor, alt, az1, alt, az2, radius);
    }
  }

  for (let azIdx = 0; azIdx < DOME_MERIDIAN_COUNT; azIdx += 1) {
    const az = azIdx * DOME_AZ_STEP_DEG;
    for (let i = 0; i < DOME_MERIDIAN_SAMPLES - 1; i += 1) {
      const alt1 = (i / (DOME_MERIDIAN_SAMPLES - 1)) * 90;
      const alt2 = ((i + 1) / (DOME_MERIDIAN_SAMPLES - 1)) * 90;
      cursor = writeSegment(positions, cursor, alt1, az, alt2, az, radius);
    }
  }

  return { positions, ringSegments, meridianSegments };
}

function writeSegment(
  buffer: Float32Array,
  cursor: number,
  alt1: number,
  az1: number,
  alt2: number,
  az2: number,
  radius: number,
): number {
  const a = altAzToXyz(alt1, az1, radius);
  const b = altAzToXyz(alt2, az2, radius);
  buffer[cursor++] = a.x;
  buffer[cursor++] = a.y;
  buffer[cursor++] = a.z;
  buffer[cursor++] = b.x;
  buffer[cursor++] = b.y;
  buffer[cursor++] = b.z;
  return cursor;
}
