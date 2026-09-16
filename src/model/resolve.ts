/**
 * Applies project-level fallback coordinates to a light's header fields
 * and computes the horizontal position (Alt/Az) when all required inputs
 * are present. A light missing any of RA/Dec/Lat/Lon/DATE-OBS after
 * fallback has been applied is left without a position -- callers
 * (the timeline builder) silently exclude those from the arc.
 *
 * `computeAltAz` is injected so this module -- and its tests -- can stay
 * free of any concrete astronomy library. The default wiring is in
 * `model/index.ts` and uses `astro/altaz.ts`.
 */

import { computeAltAz } from '../astro/altaz';
import { hasPosition, type LightFrame } from './light_frame';

export interface FallbackCoordinates {
  raDeg: number | null;
  decDeg: number | null;
  latDeg: number | null;
  lonDeg: number | null;
}

export interface AltAzFn {
  (
    when: Date,
    observer: { latitudeDeg: number; longitudeDeg: number },
    target: {
      raDeg: number;
      decDeg: number;
    },
  ): { altitudeDeg: number; azimuthDeg: number };
}

export function resolveLightPosition(
  light: LightFrame,
  fallback: FallbackCoordinates,
  altaz: AltAzFn = defaultAltAz,
): LightFrame {
  const raDeg = light.objRaDeg ?? fallback.raDeg;
  const decDeg = light.objDecDeg ?? fallback.decDeg;
  const latDeg = light.siteLatDeg ?? fallback.latDeg;
  const lonDeg = light.siteLonDeg ?? fallback.lonDeg;

  const filled: LightFrame = {
    ...light,
    objRaDeg: raDeg,
    objDecDeg: decDeg,
    siteLatDeg: latDeg,
    siteLonDeg: lonDeg,
  };

  if (raDeg === null || decDeg === null || latDeg === null || lonDeg === null) {
    return { ...filled, altDeg: null, azDeg: null };
  }
  if (!light.dateObs) {
    return { ...filled, altDeg: null, azDeg: null };
  }
  const date = new Date(light.dateObs);
  if (Number.isNaN(date.getTime())) {
    return { ...filled, altDeg: null, azDeg: null };
  }

  const { altitudeDeg, azimuthDeg } = altaz(
    date,
    { latitudeDeg: latDeg, longitudeDeg: lonDeg },
    { raDeg, decDeg },
  );
  return { ...filled, altDeg: altitudeDeg, azDeg: azimuthDeg };
}

function defaultAltAz(
  when: Date,
  observer: { latitudeDeg: number; longitudeDeg: number },
  target: { raDeg: number; decDeg: number },
): { altitudeDeg: number; azimuthDeg: number } {
  return computeAltAz(when, observer, target);
}

export function projectFallback(project: {
  fallbackObjRaDeg: number | null;
  fallbackObjDecDeg: number | null;
  fallbackSiteLatDeg: number | null;
  fallbackSiteLonDeg: number | null;
}): FallbackCoordinates {
  return {
    raDeg: project.fallbackObjRaDeg,
    decDeg: project.fallbackObjDecDeg,
    latDeg: project.fallbackSiteLatDeg,
    lonDeg: project.fallbackSiteLonDeg,
  };
}

export { hasPosition };
