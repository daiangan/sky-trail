import { Body, Equator, Horizon, MakeTime, Observer } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { computeAltAz } from '../../src/astro/altaz';
import {
  DEMO_DITHER_EVERY,
  DEMO_FRAME_BYTES,
  DEMO_OBJECTS,
  DEMO_SITE,
  generateDemoSessions,
  seededRandom,
} from '../../src/demo/demo_data';
import { parseFitsDate } from '../../src/astro/date_parse';
import type { LightFrame } from '../../src/model/light_frame';

const observer = { latitudeDeg: DEMO_SITE.latDeg, longitudeDeg: DEMO_SITE.lonDeg };

function timeOf(light: LightFrame): number {
  return parseFitsDate(light.dateObs)!.getTime();
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
  const allLights = sessions.flatMap((session) => session.lights);

  it('is deterministic for a seed and varies with another', () => {
    expect(generateDemoSessions()).toEqual(sessions);
    expect(generateDemoSessions(1)).not.toEqual(sessions);
  });

  it('makes two objects imaged on two nights each, in chronological order', () => {
    expect(sessions.map((s) => s.name)).toEqual([
      'Object 1 · Night 1',
      'Object 2 · Night 1',
      'Object 1 · Night 2',
      'Object 2 · Night 2',
    ]);
    const starts = sessions.map((s) => timeOf(s.lights[0]!));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('has a few hundred frames, enough for a good animation', () => {
    expect(allLights.length).toBeGreaterThanOrEqual(150);
    expect(allLights.length).toBeLessThanOrEqual(220);
    for (const session of sessions) expect(session.lights.length).toBeGreaterThan(25);
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
      const object = DEMO_OBJECTS[i % 2]!;
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

  it('only shoots in the dark and keeps the object well above the horizon', () => {
    for (const light of allLights) {
      const ms = timeOf(light);
      expect(sunAltitude(ms)).toBeLessThan(-18);
      const { altitudeDeg } = computeAltAz(new Date(ms), observer, {
        raDeg: light.objRaDeg!,
        decDeg: light.objDecDeg!,
      });
      expect(altitudeDeg).toBeGreaterThan(35);
    }
  });

  it('draws a real arc: the object rises towards the meridian and then falls', () => {
    const lights = sessions[0]!.lights;
    const altitudes = lights.map(
      (l) =>
        computeAltAz(new Date(timeOf(l)), observer, { raDeg: l.objRaDeg!, decDeg: l.objDecDeg! })
          .altitudeDeg,
    );
    const peak = Math.max(...altitudes);
    const peakIndex = altitudes.indexOf(peak);
    expect(peakIndex).toBeGreaterThan(altitudes.length * 0.25);
    expect(peakIndex).toBeLessThan(altitudes.length * 0.75);
    expect(peak).toBeCloseTo(90 - Math.abs(DEMO_SITE.latDeg - DEMO_OBJECTS[0]!.decDeg), 0);
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

  it('spreads the nights of one object over more than a week, as weather would', () => {
    const night1 = timeOf(sessions[0]!.lights[0]!);
    const night2 = timeOf(sessions[2]!.lights[0]!);
    const days = (night2 - night1) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(8);
    expect(days).toBeLessThan(10);
  });

  it('starts at the same clock time each night, so the arc drifts along the sky', () => {
    const minuteOfDay = (ms: number) => {
      const d = new Date(ms);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    };
    const first = sessions[0]!.lights[0]!;
    const later = sessions[2]!.lights[0]!;
    expect(Math.abs(minuteOfDay(timeOf(first)) - minuteOfDay(timeOf(later)))).toBeLessThanOrEqual(
      13,
    );

    // The sky has moved on by then, so the object starts the night somewhere else.
    const altitudeAt = (l: LightFrame) =>
      computeAltAz(new Date(timeOf(l)), observer, { raDeg: l.objRaDeg!, decDeg: l.objDecDeg! })
        .altitudeDeg;
    expect(Math.abs(altitudeAt(first) - altitudeAt(later))).toBeGreaterThan(1.5);
  });
});
