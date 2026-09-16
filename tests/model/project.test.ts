import { describe, expect, it } from 'vitest';
import {
  addSession,
  allLights,
  createProject,
  moveSession,
  removeSession,
  setFallbackCoords,
  totalBytes,
  totalExptimeS,
  totalLightCount,
} from '../../src/model/project';
import { addLight, createSession } from '../../src/model/session';
import type { LightFrame } from '../../src/model/light_frame';

function light(minute: number, exptime = 60, sizeBytes = 1_000_000): LightFrame {
  return {
    path: `/${minute}.fits`,
    dateObs: `2026-01-01T20:${String(minute).padStart(2, '0')}:00Z`,
    exptime,
    filterName: 'L',
    sizeBytes,
    objRaDeg: 10,
    objDecDeg: 10,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: 10,
    azDeg: 20,
  };
}

function buildProject(): ReturnType<typeof createProject> {
  let s1 = createSession(0);
  s1 = addLight(s1, light(0));
  s1 = addLight(s1, light(1));
  let s2 = createSession(1);
  s2 = addLight(s2, light(2));
  let p = createProject('Heart Nebula');
  p = addSession(p, s1);
  p = addSession(p, s2);
  return p;
}

describe('createProject', () => {
  it('starts empty with all-null fallback coordinates', () => {
    const p = createProject();
    expect(p.name).toBe('Untitled project');
    expect(p.sessions).toEqual([]);
    expect(p.fallbackObjRaDeg).toBeNull();
    expect(p.fallbackObjDecDeg).toBeNull();
    expect(p.fallbackSiteLatDeg).toBeNull();
    expect(p.fallbackSiteLonDeg).toBeNull();
  });
});

describe('project totals', () => {
  it('aggregates across all sessions', () => {
    const p = buildProject();
    expect(totalLightCount(p)).toBe(3);
    expect(totalExptimeS(p)).toBe(180);
    expect(totalBytes(p)).toBe(3_000_000);
  });
});

describe('allLights', () => {
  it('flattens sessions in order with 1-based night index', () => {
    const p = buildProject();
    const flat = allLights(p);
    expect(flat).toHaveLength(3);
    expect(flat[0]?.nightIndex).toBe(1);
    expect(flat[1]?.nightIndex).toBe(1);
    expect(flat[2]?.nightIndex).toBe(2);
  });

  it('respects session order: moving a session reorders the flat list', () => {
    const p = buildProject();
    const reordered = moveSession(p, 1, 0);
    const flat = allLights(reordered);
    // nightIndex is the session's *current* 1-based position, so after
    // moving session 1 to position 0, the nightIndex values flip.
    expect(flat.map((l) => l.nightIndex)).toEqual([1, 2, 2]);
  });
});

describe('session management', () => {
  it('adds and removes sessions immutably', () => {
    const p0 = createProject();
    const s = createSession(0);
    const p1 = addSession(p0, s);
    expect(p0.sessions).toHaveLength(0);
    expect(p1.sessions).toHaveLength(1);

    const p2 = removeSession(p1, 0);
    expect(p1.sessions).toHaveLength(1);
    expect(p2.sessions).toHaveLength(0);
  });

  it('moveSession is a no-op for equal indices and out-of-range indices', () => {
    const p = buildProject();
    expect(moveSession(p, 0, 0)).toBe(p);
    expect(moveSession(p, 0, 5)).toBe(p);
    expect(moveSession(p, -1, 0)).toBe(p);
  });
});

describe('setFallbackCoords', () => {
  it('updates only the fields provided', () => {
    const p0 = createProject();
    const p1 = setFallbackCoords(p0, { raDeg: 83.82, decDeg: -5.39 });
    expect(p1.fallbackObjRaDeg).toBe(83.82);
    expect(p1.fallbackObjDecDeg).toBe(-5.39);
    expect(p1.fallbackSiteLatDeg).toBeNull();
    expect(p1.fallbackSiteLonDeg).toBeNull();

    const p2 = setFallbackCoords(p1, { latDeg: 40, lonDeg: -3.7 });
    expect(p2.fallbackObjRaDeg).toBe(83.82);
    expect(p2.fallbackSiteLatDeg).toBe(40);
    expect(p2.fallbackSiteLonDeg).toBe(-3.7);
  });

  it('accepts explicit null to clear a previously-set field', () => {
    const p1 = setFallbackCoords(createProject(), { raDeg: 10 });
    const p2 = setFallbackCoords(p1, { raDeg: null });
    expect(p1.fallbackObjRaDeg).toBe(10);
    expect(p2.fallbackObjRaDeg).toBeNull();
  });
});
