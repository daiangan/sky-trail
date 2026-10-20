import { Body, Equator, Horizon, MakeTime, Observer } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { computeAltAz } from '../../src/astro/altaz';
import { parseFitsDate } from '../../src/astro/date_parse';
import {
  DEMO_DITHER_EVERY,
  DEMO_FRAME_BYTES,
  DEMO_OBJECTS,
  DEMO_SITE,
  generateDemoSessions,
  seededRandom,
} from '../../src/demo/demo_data';
import type { LightFrame } from '../../src/model/light_frame';

const observer = { latitudeDeg: DEMO_SITE.latDeg, longitudeDeg: DEMO_SITE.lonDeg };

function timeOf(light: LightFrame): number {
  return parseFitsDate(light.dateObs)!.getTime();
}

function altitudeOf(light: LightFrame): number {
  return computeAltAz(new Date(timeOf(light)), observer, {
    raDeg: light.objRaDeg!,
    decDeg: light.objDecDeg!,
  }).altitudeDeg;
}

function sunAltitude(ms: number): number {
  const time = MakeTime(new Date(ms));
  const obs = new Observer(DEMO_SITE.latDeg, DEMO_SITE.lonDeg, 0);
  const sun = Equator(Body.Sun, time, obs, true, true);
  return Horizon(time, obs, sun.ra, sun.dec, undefined).altitude;
}

describe('seededRandom', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    expect(first).not.toEqual([c(), c(), c()]);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generateDemoSessions', () => {
  const sessions = generateDemoSessions();
  const [first, second] = sessions as [(typeof sessions)[number], (typeof sessions)[number]];
  const allLights = sessions.flatMap((session) => session.lights);

  it('is deterministic for a seed and varies with another', () => {
    expect(generateDemoSessions()).toEqual(sessions);
    expect(generateDemoSessions(1)).not.toEqual(sessions);
  });

  it('makes two objects imaged on the same night, one session each', () => {
    expect(sessions.map((s) => s.name)).toEqual(['Object 1', 'Object 2']);
    const night = (light: LightFrame) => light.dateObs!.slice(0, 10);
    expect(new Set(allLights.map(night)).size).toBe(1);
  });

  it('images them one after the other, as one telescope must, with a pause to switch', () => {
    const lastEnd = timeOf(first.lights.at(-1)!) + first.lights.at(-1)!.exptime! * 1000;
    const nextStart = timeOf(second.lights[0]!);
    const pauseS = (nextStart - lastEnd) / 1000;
    // Slew, centre and settle: four to six minutes (timestamps are whole seconds).
    expect(pauseS).toBeGreaterThanOrEqual(238);
    expect(pauseS).toBeLessThanOrEqual(362);

    // No frame of one object falls inside the other's block.
    expect(Math.max(...first.lights.map(timeOf))).toBeLessThan(nextStart);
  });

  it('has about a hundred frames, enough for a good animation', () => {
    expect(allLights.length).toBeGreaterThanOrEqual(80);
    expect(allLights.length).toBeLessThanOrEqual(160);
    for (const session of sessions) expect(session.lights.length).toBeGreaterThan(30);
  });

  it('gives every frame a unique file name, which the dome uses to find it', () => {
    expect(new Set(allLights.map((l) => l.path)).size).toBe(allLights.length);
  });

  it('describes each frame like a real header would', () => {
    for (const light of allLights) {
      expect(light.sizeBytes).toBe(DEMO_FRAME_BYTES);
      expect(light.filterName).toBe('L');
      expect(light.siteLatDeg).toBe(DEMO_SITE.latDeg);
      expect(light.siteLonDeg).toBe(DEMO_SITE.lonDeg);
      expect(light.dateObs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    }
    sessions.forEach((session, i) => {
      const object = DEMO_OBJECTS[i]!;
      for (const light of session.lights) {
        expect(light.objRaDeg).toBe(object.raDeg);
        expect(light.objDecDeg).toBe(object.decDeg);
        expect(light.exptime).toBe(object.exptimeS);
      }
    });
  });

  it('dithers: a longer pause after every third frame, a short download gap otherwise', () => {
    for (const session of sessions) {
      const { lights } = session;
      for (let i = 0; i < lights.length - 1; i += 1) {
        const gapS = (timeOf(lights[i + 1]!) - timeOf(lights[i]!)) / 1000 - lights[i]!.exptime!;
        if ((i + 1) % DEMO_DITHER_EVERY === 0) {
          // download (4-7 s) plus dither (15-30 s); timestamps are whole seconds
          expect(gapS).toBeGreaterThanOrEqual(18);
          expect(gapS).toBeLessThanOrEqual(38);
        } else {
          expect(gapS).toBeGreaterThanOrEqual(3);
          expect(gapS).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('only shoots in the dark and keeps the objects well above the horizon', () => {
    for (const light of allLights) {
      expect(sunAltitude(timeOf(light))).toBeLessThan(-18);
      expect(altitudeOf(light)).toBeGreaterThan(30);
    }
  });

  it('draws real arcs: the first object climbs towards the meridian, the second sinks after it', () => {
    const rising = first.lights.map(altitudeOf);
    const sinking = second.lights.map(altitudeOf);
    expect(rising.at(-1)! - rising[0]!).toBeGreaterThan(10);
    expect(sinking[0]! - sinking.at(-1)!).toBeGreaterThan(10);

    // Together they cross the meridian, so the highest point of the night is a real transit altitude.
    const peak = Math.max(...rising, ...sinking);
    const transitAltitude = (o: (typeof DEMO_OBJECTS)[number]) =>
      90 - Math.abs(DEMO_SITE.latDeg - o.decDeg);
    expect(peak).toBeGreaterThan(Math.min(...DEMO_OBJECTS.map(transitAltitude)) - 3);
  });

  it('sweeps a wide stretch of sky, from the south-east to the south-west', () => {
    const azimuths = allLights.map(
      (l) =>
        computeAltAz(new Date(timeOf(l)), observer, { raDeg: l.objRaDeg!, decDeg: l.objDecDeg! })
          .azimuthDeg,
    );
    expect(Math.min(...azimuths)).toBeLessThan(135);
    expect(Math.max(...azimuths)).toBeGreaterThan(225);
  });

  it('keeps the two objects close together in the sky', () => {
    const [a, b] = DEMO_OBJECTS as readonly [
      (typeof DEMO_OBJECTS)[number],
      (typeof DEMO_OBJECTS)[number],
    ];
    const rad = Math.PI / 180;
    const separation =
      Math.acos(
        Math.sin(a.decDeg * rad) * Math.sin(b.decDeg * rad) +
          Math.cos(a.decDeg * rad) * Math.cos(b.decDeg * rad) * Math.cos((a.raDeg - b.raDeg) * rad),
      ) / rad;
    expect(separation).toBeGreaterThan(3);
    expect(separation).toBeLessThan(10);
  });
});
