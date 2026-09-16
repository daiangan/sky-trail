/**
 * Converts an equatorial coordinate (RA, Dec) to horizontal coordinates
 * (altitude, azimuth) as seen from a given observer location at a given
 * UTC instant.
 *
 * Backed by `astronomy-engine` (Don Cross's NOVAS-derived implementation).
 * The library uses J2000 mean equator/equinox of date, which differs from
 * astropy's ICRS->CIRS transform chain by about 0.2 deg in altitude/azimuth
 * for modern dates -- well below one pixel at typical astrophotography
 * focal lengths, but documented here so the swap to a different library
 * later is a one-file change.
 *
 * The output azimuth follows the convention spelled out in the migration
 * prompt: clockwise from North, in [0, 360), same as astropy.AltAz.
 *
 * No atmospheric refraction is applied -- the dome is a visualisation, and
 * refraction would only nudge points near the horizon by a fraction of a
 * degree. The argument is here if a future caller wants to enable it.
 */

import { Horizon, MakeTime, Observer } from 'astronomy-engine';

export interface ObserverLocation {
  latitudeDeg: number;
  longitudeDeg: number;
}

export interface EquatorialCoord {
  raDeg: number;
  decDeg: number;
}

export interface HorizontalCoord {
  altitudeDeg: number;
  azimuthDeg: number;
}

export function computeAltAz(
  when: Date,
  observer: ObserverLocation,
  target: EquatorialCoord,
): HorizontalCoord {
  const obs = new Observer(observer.latitudeDeg, observer.longitudeDeg, 0);
  const time = MakeTime(when);
  const result = Horizon(time, obs, target.raDeg / 15, target.decDeg, undefined);
  return {
    altitudeDeg: result.altitude,
    azimuthDeg: ((result.azimuth % 360) + 360) % 360,
  };
}
