/**
 * Where each point of the timeline sits on the dome.
 *
 * The result is indexed by the point's position in the timeline, never by file
 * name: two nights routinely contain files with the same name (`Light_001.fits`
 * in each folder), and keying by name made the later night overwrite the
 * earlier one's positions.
 */

import { computeAltAz } from '../astro/altaz';
import { parseFitsDate } from '../astro/date_parse';
import type { TimelinePoint } from '../model/timeline';
import { altAzToXyz, type Vec3 } from './coordinates';

/** One entry per timeline point, in order; `null` when the point cannot be placed. */
export function resolveTimelinePositions(timeline: readonly TimelinePoint[]): Array<Vec3 | null> {
  return timeline.map((point) => {
    const light = point.light;
    if (light.altDeg !== null && light.azDeg !== null) {
      return altAzToXyz(light.altDeg, light.azDeg);
    }
    if (
      light.objRaDeg === null ||
      light.objDecDeg === null ||
      light.siteLatDeg === null ||
      light.siteLonDeg === null ||
      !light.dateObs
    ) {
      return null;
    }
    const when = parseFitsDate(light.dateObs);
    if (!when) return null;
    const { altitudeDeg, azimuthDeg } = computeAltAz(
      when,
      { latitudeDeg: light.siteLatDeg, longitudeDeg: light.siteLonDeg },
      { raDeg: light.objRaDeg, decDeg: light.objDecDeg },
    );
    return altAzToXyz(altitudeDeg, azimuthDeg);
  });
}
