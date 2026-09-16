import { describe, expect, it } from 'vitest';
import type { LightFrame } from '../../src/model/light_frame';
import {
  DEFAULT_SESSION_PALETTE,
  addLight,
  createSession,
  defaultSessionColor,
  defaultSessionName,
  renameSession,
  sessionDate,
  sessionLightCount,
  sessionTotalBytes,
  sessionTotalExptimeS,
  setSessionColor,
} from '../../src/model/session';

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

describe('defaultSessionColor', () => {
  it('rotates through the 10-color default palette', () => {
    expect(defaultSessionColor(0)).toBe(DEFAULT_SESSION_PALETTE[0]);
    expect(defaultSessionColor(1)).toBe(DEFAULT_SESSION_PALETTE[1]);
    expect(defaultSessionColor(9)).toBe(DEFAULT_SESSION_PALETTE[9]);
  });

  it('wraps past the end of the palette', () => {
    expect(defaultSessionColor(10)).toBe(DEFAULT_SESSION_PALETTE[0]);
    expect(defaultSessionColor(11)).toBe(DEFAULT_SESSION_PALETTE[1]);
  });

  it('handles negative indices', () => {
    expect(defaultSessionColor(-1)).toBe(DEFAULT_SESSION_PALETTE[9]);
  });
});

describe('createSession', () => {
  it('produces "Night N" and a default color when called without overrides', () => {
    const s0 = createSession(0);
    expect(s0.name).toBe('Night 1');
    expect(s0.color).toBe(DEFAULT_SESSION_PALETTE[0]);
    expect(s0.lights).toEqual([]);
  });

  it('uses caller-supplied name and color when provided', () => {
    const s = createSession(2, 'Ha run', '#ff00ff');
    expect(s.name).toBe('Ha run');
    expect(s.color).toBe('#ff00ff');
  });
});

describe('session helpers', () => {
  it('returns the right default name for any index', () => {
    expect(defaultSessionName(0)).toBe('Night 1');
    expect(defaultSessionName(7)).toBe('Night 8');
  });

  it('counts lights, sums exptime and bytes', () => {
    let s = createSession(0);
    s = addLight(s, light(0, 60, 1_000_000));
    s = addLight(s, light(1, 120, 2_000_000));
    s = addLight(s, light(2, 180, 3_000_000));

    expect(sessionLightCount(s)).toBe(3);
    expect(sessionTotalExptimeS(s)).toBe(360);
    expect(sessionTotalBytes(s)).toBe(6_000_000);
  });

  it('handles lights with missing exptime as zero', () => {
    let s = createSession(0);
    s = addLight(s, light(0, 60));
    s = addLight(s, { ...light(1), exptime: null });
    expect(sessionTotalExptimeS(s)).toBe(60);
  });

  it('returns the earliest DATE-OBS in the session', () => {
    let s = createSession(0);
    s = addLight(s, light(5));
    s = addLight(s, light(0));
    s = addLight(s, light(10));
    expect(sessionDate(s)).toBe('2026-01-01T20:00:00Z');
  });

  it('returns null for date when no light has DATE-OBS', () => {
    let s = createSession(0);
    s = addLight(s, { ...light(0), dateObs: null });
    expect(sessionDate(s)).toBeNull();
  });
});

describe('session mutators', () => {
  it('renames without mutating the original', () => {
    const original = createSession(0);
    const renamed = renameSession(original, 'New name');
    expect(original.name).toBe('Night 1');
    expect(renamed.name).toBe('New name');
  });

  it('changes color without mutating the original', () => {
    const original = createSession(0);
    const recolored = setSessionColor(original, '#abcdef');
    expect(original.color).toBe(DEFAULT_SESSION_PALETTE[0]);
    expect(recolored.color).toBe('#abcdef');
  });
});
