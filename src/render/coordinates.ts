/**
 * Equatorial -> horizontal -> 3D-XYZ conversions.
 *
 * The 3D conversion matches astropy.AltAz + the Python project's
 * `render.dome_geometry`: Z is up, azimuth is measured clockwise from
 * North (+Y) toward East (+X), so no axis remapping is needed between
 * the Alt/Az values the animation already computes and the 3D scene.
 *
 * `DOME_RADIUS = 10` is the arbitrary scene unit used by the Python
 * project; reusing it keeps camera/orbit constants (R*3.2 distance, etc.)
 * in lockstep with the desktop tool.
 */

export const DOME_RADIUS = 10;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function altAzToXyz(altDeg: number, azDeg: number, radius: number = DOME_RADIUS): Vec3 {
  const alt = (altDeg * Math.PI) / 180;
  const az = (azDeg * Math.PI) / 180;
  const cosAlt = Math.cos(alt);
  return {
    x: radius * cosAlt * Math.sin(az),
    y: radius * cosAlt * Math.cos(az),
    z: radius * Math.sin(alt),
  };
}

export function xyzToAltAz(v: Vec3): { altitudeDeg: number; azimuthDeg: number } {
  const radius = Math.hypot(v.x, v.y, v.z);
  if (radius === 0) return { altitudeDeg: 0, azimuthDeg: 0 };
  const altitudeDeg = (Math.asin(v.z / radius) * 180) / Math.PI;
  // atan2(x, y) gives azimuth from +Y (north) toward +X (east), matching
  // the convention used by astropy and the alt/az -> xyz formula above.
  const azimuthDeg = ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;
  return { altitudeDeg, azimuthDeg };
}
