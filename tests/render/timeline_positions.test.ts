import { describe, expect, it } from 'vitest';
import { createProject, addSession } from '../../src/model/project';
import type { LightFrame } from '../../src/model/light_frame';
import { addLight, createSession } from '../../src/model/session';
import { buildTimeline, type AltAzFn } from '../../src/model/timeline';
import { altAzToXyz } from '../../src/render/coordinates';
import { resolveTimelinePositions } from '../../src/render/timeline_positions';

/** Altitude follows the hour and azimuth the minute, so every frame lands somewhere different. */
const SPREAD_ALTAZ: AltAzFn = (when) => ({
  altitudeDeg: 20 + when.getUTCHours() * 3,
  azimuthDeg: 100 + when.getUTCMinutes() * 2,
});

function light(path: string, dateObs: string, overrides: Partial<LightFrame> = {}): LightFrame {
  return {
    path,
    dateObs,
    exptime: 60,
    filterName: 'L',
    sizeBytes: 1,
    objRaDeg: 10,
    objDecDeg: 10,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: null,
    azDeg: null,
    ...overrides,
  };
}

describe('resolveTimelinePositions', () => {
  it('gives each frame its own position even when two nights reuse the same file names', () => {
    // The same names in both folders, as N.I.N.A.-style sequences or manual renames produce.
    let night1 = createSession(0, 'Night 1');
    let night2 = createSession(1, 'Night 2');
    for (const n of ['Light_001.fits', 'Light_002.fits', 'Light_003.fits']) {
      night1 = addLight(night1, light(n, `2026-01-01T2${n.slice(-6, -5)}:10:00`));
      night2 = addLight(night2, light(n, `2026-01-09T0${n.slice(-6, -5)}:40:00`));
    }
    const timeline = buildTimeline(
      addSession(addSession(createProject(), night1), night2),
      SPREAD_ALTAZ,
    );
    expect(timeline).toHaveLength(6);

    const positions = resolveTimelinePositions(timeline);
    expect(positions).toHaveLength(6);
    timeline.forEach((point, i) => {
      expect(positions[i]).toEqual(altAzToXyz(point.light.altDeg!, point.light.azDeg!));
    });

    // Six frames, six different places: none overwrote another.
    const distinct = new Set(
      positions.map((p) => `${p!.x.toFixed(4)},${p!.y.toFixed(4)},${p!.z.toFixed(4)}`),
    );
    expect(distinct.size).toBe(6);
  });

  it('keeps the order of the timeline', () => {
    let session = createSession(0);
    session = addLight(session, light('b.fits', '2026-01-01T22:00:00'));
    session = addLight(session, light('a.fits', '2026-01-01T20:00:00'));
    const timeline = buildTimeline(addSession(createProject(), session), SPREAD_ALTAZ);
    const positions = resolveTimelinePositions(timeline);
    // The timeline is sorted by time, so the earlier frame (20h) comes first and is lower.
    expect(timeline[0]!.light.path).toBe('a.fits');
    expect(positions[0]!.z).toBeLessThan(positions[1]!.z);
  });

  it('computes a position from the header for a point that has no stored altitude', () => {
    const unresolved = {
      light: light('x.fits', '2026-01-01T22:00:00'),
      nightIndex: 1,
      totalNights: 1,
      cumulativeExptimeS: 60,
      cumulativeSubframes: 1,
      cumulativeBytes: 1,
    };
    const [position] = resolveTimelinePositions([unresolved]);
    expect(position).not.toBeNull();
    expect(Math.hypot(position!.x, position!.y, position!.z)).toBeCloseTo(10, 3);
  });

  it('returns null for a point that cannot be placed', () => {
    const point = {
      light: light('y.fits', '2026-01-01T22:00:00', { objRaDeg: null }),
      nightIndex: 1,
      totalNights: 1,
      cumulativeExptimeS: 60,
      cumulativeSubframes: 1,
      cumulativeBytes: 1,
    };
    expect(resolveTimelinePositions([point])).toEqual([null]);
  });
});
