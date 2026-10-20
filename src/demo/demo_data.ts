/**
 * Simulated capture sessions for the "Try a demo" button, so anyone can see
 * SkyTrail work without FITS files.
 *
 * The objects are invented ("Object 1", "Object 2"), but the sky they move
 * through is real: positions come from the same equatorial-to-horizontal
 * maths as real lights, so the arcs behave like a real capture.
 *
 * It is one night with one telescope: Object 1 is imaged first, then the
 * mount slews to Object 2, which takes the rest of the night. The night is
 * centred on the objects' meridian transit, when they are highest, and falls
 * in the dark. The cadence imitates a real imaging run: a short download gap
 * after every frame, a longer pause for the dither (a small pointing shift)
 * after every third frame, and a few seconds of jitter so it never looks
 * mechanical.
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
/** Slewing to the next object, centring it and settling the guiding. */
const SWITCH_TARGET_S = { min: 240, max: 360 };

const HOUR_MS = 3600 * 1000;
/** How long each object is imaged; both blocks together stay within the dark hours. */
const BLOCK_HOURS = 3.25;
/** The sequence is started by hand, so it begins a few minutes either side of the planned time. */
const START_JITTER_MINUTES = 6;

/** Local midnight at the site falls around the transit of these objects in mid-August. */
const NIGHT_UTC = Date.UTC(2026, 7, 12);
const DEFAULT_SEED = 20260812;

interface DemoObject {
  name: string;
  raDeg: number;
  decDeg: number;
  exptimeS: number;
}

/** About seven degrees apart, in the order they are imaged. */
export const DEMO_OBJECTS: readonly DemoObject[] = [
  { name: 'Object 1', raDeg: 325, decDeg: 4, exptimeS: 180 },
  { name: 'Object 2', raDeg: 330.5, decDeg: 9, exptimeS: 240 },
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

/** When the last exposure of a block finishes (DATE-OBS is the exposure start). */
function lastLightEndMs(lights: LightFrame[], fallbackMs: number): number {
  const last = lights[lights.length - 1];
  if (!last) return fallbackMs;
  return Date.parse(`${last.dateObs}Z`) + (last.exptime ?? 0) * 1000;
}

/** DATE-OBS spelling used by capture software: UTC, no time zone suffix. */
function toDateObs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

export function generateDemoSessions(seed: number = DEFAULT_SEED): Session[] {
  const random = seededRandom(seed);

  // Centre the whole night on the transit of the midpoint between the objects, so
  // both arcs are high and the first rises towards the meridian as the second falls.
  const meanRaDeg = DEMO_OBJECTS.reduce((sum, o) => sum + o.raDeg, 0) / DEMO_OBJECTS.length;
  const transit = nextMeridianTransit(meanRaDeg, DEMO_SITE.lonDeg, new Date(NIGHT_UTC));
  const nominalNightMs = DEMO_OBJECTS.length * BLOCK_HOURS * HOUR_MS + SWITCH_TARGET_S.max * 1000;
  const jitterMs = (random() * 2 - 1) * START_JITTER_MINUTES * 60 * 1000;
  let blockStartMs = transit.getTime() - nominalNightMs / 2 + jitterMs;

  return DEMO_OBJECTS.map((object, objectIndex) => {
    const blockEndMs = blockStartMs + BLOCK_HOURS * HOUR_MS;
    const prefix = `${object.name.replace(' ', '')}_${DEMO_FILTER}_${object.exptimeS}s`;

    const lights: LightFrame[] = [];
    let t = blockStartMs;
    while (t + object.exptimeS * 1000 <= blockEndMs) {
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

    // The next object starts right after the last exposure, plus the slew.
    blockStartMs = lastLightEndMs(lights, blockStartMs) + between(random, SWITCH_TARGET_S) * 1000;
    return { ...createSession(objectIndex, object.name), lights };
  });
}
