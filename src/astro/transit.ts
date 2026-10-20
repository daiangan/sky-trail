/**
 * When a fixed point on the celestial sphere crosses the observer's meridian
 * (its highest point in the sky). That is when local sidereal time equals the
 * point's right ascension, so no iteration is needed.
 */

import { MakeTime, SiderealTime } from 'astronomy-engine';

/** Sidereal hours that pass per solar hour: the sky drifts about 4 minutes a day. */
const SIDEREAL_HOURS_PER_SOLAR_HOUR = 1.00273790935;

/** The first meridian transit at `longitudeDeg` (east positive) at or after `from`. */
export function nextMeridianTransit(raDeg: number, longitudeDeg: number, from: Date): Date {
  const greenwichSiderealHours = SiderealTime(MakeTime(from));
  const localSiderealHours = (((greenwichSiderealHours + longitudeDeg / 15) % 24) + 24) % 24;
  const siderealHoursUntil = ((((raDeg / 15 - localSiderealHours) % 24) + 24) % 24) as number;
  const solarHoursUntil = siderealHoursUntil / SIDEREAL_HOURS_PER_SOLAR_HOUR;
  return new Date(from.getTime() + solarHoursUntil * 3600 * 1000);
}
