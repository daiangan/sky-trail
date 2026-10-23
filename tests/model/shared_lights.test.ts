import { describe, expect, it } from 'vitest';
import type { LightFrame } from '../../src/model/light_frame';
import {
  addSession,
  createProject,
  hasSameLights,
  setFallbackCoords,
} from '../../src/model/project';
import {
  addLight,
  addLights,
  createSession,
  renameSession,
  setSessionColor,
} from '../../src/model/session';
import { timelineOf } from '../../src/model/timeline';

function light(minute: number): LightFrame {
  return {
    path: `/${minute}.fits`,
    dateObs: `2026-01-01T20:${String(minute).padStart(2, '0')}:00Z`,
    exptime: 60,
    filterName: null,
    sizeBytes: 100,
    objRaDeg: 83.8,
    objDecDeg: -5.4,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: null,
    azDeg: null,
  };
}

function projectWith(minutes: number[]) {
  let session = createSession(0);
  for (const m of minutes) session = addLight(session, light(m));
  return addSession(createProject('p'), session);
}

describe('addLights', () => {
  it('appends all lights in order with one copy', () => {
    const session = addLights(createSession(0), [light(1), light(2)]);
    expect(session.lights.map((l) => l.path)).toEqual(['/1.fits', '/2.fits']);
  });

  it('returns the same session when there is nothing to add', () => {
    const session = createSession(0);
    expect(addLights(session, [])).toBe(session);
  });
});

describe('hasSameLights', () => {
  it('is true after renaming or recolouring a session', () => {
    const a = projectWith([1, 2]);
    const renamed = { ...a, sessions: [renameSession(a.sessions[0]!, 'Renamed')] };
    const recoloured = { ...a, sessions: [setSessionColor(a.sessions[0]!, '#123456')] };
    expect(hasSameLights(a, renamed)).toBe(true);
    expect(hasSameLights(a, recoloured)).toBe(true);
  });

  it('is false when lights are added, sessions change, or fallback coordinates change', () => {
    const a = projectWith([1, 2]);
    const more = { ...a, sessions: [addLight(a.sessions[0]!, light(3))] };
    const extra = addSession(a, createSession(1));
    expect(hasSameLights(a, more)).toBe(false);
    expect(hasSameLights(a, extra)).toBe(false);
    expect(hasSameLights(a, setFallbackCoords(a, { latDeg: 10 }))).toBe(false);
  });
});

describe('timelineOf', () => {
  it('returns the very same list for the same project and for a renamed one', () => {
    const a = projectWith([1, 2, 3]);
    const first = timelineOf(a);
    expect(first).toHaveLength(3);
    expect(timelineOf(a)).toBe(first);
    const renamed = { ...a, sessions: [renameSession(a.sessions[0]!, 'Other')] };
    expect(timelineOf(renamed)).toBe(first);
  });

  it('recomputes when the lights change', () => {
    const a = projectWith([1, 2]);
    const first = timelineOf(a);
    const more = { ...a, sessions: [addLight(a.sessions[0]!, light(3))] };
    const next = timelineOf(more);
    expect(next).not.toBe(first);
    expect(next).toHaveLength(3);
  });
});
