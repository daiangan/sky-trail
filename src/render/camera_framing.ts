/**
 * Pure framing math for the dome camera.
 *
 * The camera orbits a point at the dome's visual centre -- not the middle of
 * its horizon plane -- so the hemisphere sits in the middle of the canvas
 * instead of hugging the top edge. The distance is derived from the field of
 * view and the canvas aspect ratio so the whole dome always fits, whatever
 * the window shape.
 */

/** Height of the orbit target above the horizon, as a fraction of the dome radius. */
export const DOME_TARGET_HEIGHT_RATIO = 0.4;

export interface FramingInput {
  radius: number;
  verticalFovDeg: number;
  aspect: number;
  /** Extra room around the dome, as a multiplier on the fitted radius. */
  margin?: number;
}

export interface Framing {
  /** Orbit target height (scene Y, where the zenith is +Y). */
  targetY: number;
  /** Camera distance from the target that fits the whole dome in view. */
  distance: number;
}

export function computeDomeFraming({
  radius,
  verticalFovDeg,
  aspect,
  margin = 1.2,
}: FramingInput): Framing {
  const targetY = radius * DOME_TARGET_HEIGHT_RATIO;
  // The far rim of the horizon ring is the point of the dome furthest from the target.
  const fitRadius = Math.hypot(radius, targetY) * margin;
  const verticalHalf = (verticalFovDeg * Math.PI) / 360;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * Math.max(aspect, 0.01));
  const limitingHalf = Math.min(verticalHalf, horizontalHalf);
  return { targetY, distance: fitRadius / Math.sin(limitingHalf) };
}
