/**
 * Simulated capture sessions for the "Try a demo" button, so anyone can see
 * SkyTrail work without FITS files.
 *
 * The objects are invented ("Object 1", "Object 2"), but the sky they move
 * through is real: positions come from the same equatorial-to-horizontal
 * maths as real lights, so the arcs behave like a real capture. Each session
 * starts at the same clock time on each of an object's nights, as a real
 * imaging routine does, with the first night centred on the object's meridian
 * transit (when it is highest and the arc longest). The sky runs about four
 * minutes ahead each day, so later nights drift along the same path instead of
 * redrawing the first arc. All dates fall in the dark. The cadence imitates a
 * real imaging run: a short download gap after every frame, a longer pause
 * for the dither (a small pointing shift) after every third frame, and a few
 * seconds of jitter so no two nights are identical.
 *
 * Output is deterministic for a given seed, which keeps it testable.
 */

import { nextMeridianTransit } from '../astro/transit';
import type { LightFrame } from '../model/light_frame';
import { createSession, type Session } from '../model/session';

/** An invented observing site at a mid-northern latitude. */
export const DEMO_SITE = { latDeg: 35, lonDeg: -105 };

/** Frames between dithers. */
export const DEMO_DITHER_EVERY = 3;

export const DEMO_FRAME_BYTES = 23_395_200;
export const DEMO_FILTER = 'L';

/** Seconds added after every frame (download and housekeeping), then after every dither. */
const DOWNLOAD_S = { min: 4, max: 7 };
const DITHER_S = { min: 15, max: 30 };

const HOUR_MS = 3600 * 1000;
const SESSION_HOURS = 3.5;
/** The session is started by hand or by a sequence, so it begins a few minutes either side of the usual time. */
const START_JITTER_MINUTES = 6;

/** Local midnight at the site falls around the transit of these objects in mid-August. */
const FIRST_NIGHT_UTC = Date.UTC(2026, 7, 12);
const DEFAULT_SEED = 20260812;

interface DemoObject {
  name: string;
  raDeg: number;
  decDeg: number;
  exptimeS: number;
}

/** About seven degrees apart, so their arcs run side by side. */
export const DEMO_OBJECTS: readonly DemoObject[] = [
  { name: 'Object 1', raDeg: 325, decDeg: 4, exptimeS: 240 },
  { name: 'Object 2', raDeg: 330.5, decDeg: 9, exptimeS: 300 },
];

/** Which object is imaged on each night, in chronological order. */
const PLAN: ReadonlyArray<{ objectIndex: number; dayOffset: number }> = [
  { objectIndex: 0, dayOffset: 0 },
  { objectIndex: 1, dayOffset: 1 },
  { objectIndex: 0, dayOffset: 9 },
  { objectIndex: 1, dayOffset: 10 },
];

/** Small seeded generator (mulberry32): same seed, same demo. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, range: { min: number; max: number }): number {
  return range.min + random() * (range.max - range.min);
}

/** DATE-OBS spelling used by capture software: UTC, no time zone suffix. */
function toDateObs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

export function generateDemoSessions(seed: number = DEFAULT_SEED): Session[] {
  const random = seededRandom(seed);
  const nightsPerObject = new Map<number, number>();
  /** Each object's usual start time, fixed by its first night. */
  const usualStart = new Map<number, { startMs: number; dayOffset: number }>();

  return PLAN.map((night, sessionIndex) => {
    const object = DEMO_OBJECTS[night.objectIndex]!;
    const nightNumber = (nightsPerObject.get(night.objectIndex) ?? 0) + 1;
    nightsPerObject.set(night.objectIndex, nightNumber);

    if (!usualStart.has(night.objectIndex)) {
      const transit = nextMeridianTransit(
        object.raDeg,
        DEMO_SITE.lonDeg,
        new Date(FIRST_NIGHT_UTC + night.dayOffset * 24 * HOUR_MS),
      );
      usualStart.set(night.objectIndex, {
        startMs: transit.getTime() - (SESSION_HOURS / 2) * HOUR_MS,
        dayOffset: night.dayOffset,
      });
    }
    const usual = usualStart.get(night.objectIndex)!;
    const jitterMs = (random() * 2 - 1) * START_JITTER_MINUTES * 60 * 1000;
    const startMs = usual.startMs + (night.dayOffset - usual.dayOffset) * 24 * HOUR_MS + jitterMs;
    const endMs = startMs + SESSION_HOURS * HOUR_MS;

    const session = createSession(sessionIndex, `${object.name} · Night ${nightNumber}`);
    const prefix = `${object.name.replace(' ', '')}_N${nightNumber}_${DEMO_FILTER}_${object.exptimeS}s`;

    const lights: LightFrame[] = [];
    let t = startMs;
    while (t + object.exptimeS * 1000 <= endMs) {
      lights.push({
        path: `${prefix}_${String(lights.length + 1).padStart(4, '0')}.fits`,
        dateObs: toDateObs(t),
        exptime: object.exptimeS,
        filterName: DEMO_FILTER,
        sizeBytes: DEMO_FRAME_BYTES,
        objRaDeg: object.raDeg,
        objDecDeg: object.decDeg,
        siteLatDeg: DEMO_SITE.latDeg,
        siteLonDeg: DEMO_SITE.lonDeg,
        altDeg: null,
        azDeg: null,
      });
      t += (object.exptimeS + between(random, DOWNLOAD_S)) * 1000;
      if (lights.length % DEMO_DITHER_EVERY === 0) t += between(random, DITHER_S) * 1000;
    }
    return { ...session, lights };
  });
}
