import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MARGIN,
  clampOrigin,
  defaultOrigin,
  hasCustomPositions,
  loadOverlayPositions,
  originFor,
  positionFromOrigin,
  saveOverlayPositions,
  validatePositions,
} from '../../src/ui/overlay_layout';

const canvas = { width: 1000, height: 600 };
const hudBox = { width: 204, height: 166 };
const chartBox = { width: 252, height: 140 };

describe('defaultOrigin', () => {
  it('puts the panel top-left and the chart bottom-right, 16px from the edges', () => {
    expect(defaultOrigin('hud', canvas, hudBox)).toEqual({ left: 16, top: 16 });
    expect(defaultOrigin('chart', canvas, chartBox)).toEqual({
      left: 1000 - 252 - DEFAULT_MARGIN,
      top: 600 - 140 - DEFAULT_MARGIN,
    });
  });
});

describe('originFor', () => {
  it('uses the default spot until the user moves the overlay', () => {
    expect(originFor('hud', {}, canvas, hudBox)).toEqual(defaultOrigin('hud', canvas, hudBox));
    expect(originFor('chart', { hud: { x: 0.5, y: 0.5 } }, canvas, chartBox)).toEqual(
      defaultOrigin('chart', canvas, chartBox),
    );
  });

  it('turns a stored fraction into pixels of the current canvas', () => {
    const positions = { hud: { x: 0.25, y: 0.5 } };
    expect(originFor('hud', positions, canvas, hudBox)).toEqual({ left: 250, top: 300 });
    // The same fraction follows the canvas when the window is resized.
    expect(originFor('hud', positions, { width: 500, height: 400 }, hudBox)).toEqual({
      left: 125,
      top: 200,
    });
  });

  it('does not depend on the overlay size unless it would leave the canvas', () => {
    const positions = { hud: { x: 0.2, y: 0.2 } };
    const small = originFor('hud', positions, canvas, { width: 204, height: 58 });
    const tall = originFor('hud', positions, canvas, hudBox);
    expect(small).toEqual(tall);
  });

  it('pulls an overlay back inside when the canvas shrinks below its position', () => {
    const positions = { chart: { x: 0.95, y: 0.95 } };
    expect(originFor('chart', positions, canvas, chartBox)).toEqual({
      left: 1000 - 252,
      top: 600 - 140,
    });
  });
});

describe('clampOrigin', () => {
  it('keeps the overlay inside the canvas', () => {
    expect(clampOrigin({ left: -40, top: -5 }, canvas, hudBox)).toEqual({ left: 0, top: 0 });
    expect(clampOrigin({ left: 5000, top: 5000 }, canvas, hudBox)).toEqual({
      left: 1000 - 204,
      top: 600 - 166,
    });
  });

  it('pins an overlay larger than the canvas to the top-left', () => {
    expect(clampOrigin({ left: 30, top: 30 }, { width: 100, height: 100 }, hudBox)).toEqual({
      left: 0,
      top: 0,
    });
  });
});

describe('positionFromOrigin', () => {
  it('round-trips with originFor', () => {
    const stored = positionFromOrigin({ left: 400, top: 120 }, canvas, hudBox);
    expect(stored).toEqual({ x: 0.4, y: 0.2 });
    expect(originFor('hud', { hud: stored }, canvas, hudBox)).toEqual({ left: 400, top: 120 });
  });

  it('clamps a drop outside the canvas', () => {
    const stored = positionFromOrigin({ left: -100, top: 9999 }, canvas, hudBox);
    expect(stored.x).toBe(0);
    expect(stored.y).toBeCloseTo((600 - 166) / 600, 10);
  });

  it('returns the origin for an empty canvas', () => {
    expect(positionFromOrigin({ left: 10, top: 10 }, { width: 0, height: 0 }, hudBox)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('hasCustomPositions', () => {
  it('is true only once an overlay has been moved', () => {
    expect(hasCustomPositions({})).toBe(false);
    expect(hasCustomPositions({ chart: { x: 0.1, y: 0.1 } })).toBe(true);
  });
});

describe('validatePositions', () => {
  it('keeps well-formed positions and clamps them to the canvas', () => {
    expect(validatePositions({ hud: { x: 0.3, y: 0.4 }, chart: { x: 2, y: -1 } })).toEqual({
      hud: { x: 0.3, y: 0.4 },
      chart: { x: 1, y: 0 },
    });
  });

  it('ignores anything malformed or unknown', () => {
    expect(validatePositions(null)).toEqual({});
    expect(validatePositions('oops')).toEqual({});
    expect(validatePositions({ hud: { x: 'a', y: 1 } })).toEqual({});
    expect(validatePositions({ hud: { x: Number.NaN, y: 0 } })).toEqual({});
    expect(validatePositions({ hud: 5, other: { x: 0, y: 0 } })).toEqual({});
  });
});

describe('persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  function installStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    return store;
  }

  it('saves and restores positions', () => {
    installStorage();
    saveOverlayPositions({ hud: { x: 0.5, y: 0.25 } });
    expect(loadOverlayPositions()).toEqual({ hud: { x: 0.5, y: 0.25 } });
  });

  it('forgets everything when the positions are reset', () => {
    const store = installStorage();
    saveOverlayPositions({ hud: { x: 0.5, y: 0.25 } });
    saveOverlayPositions({});
    expect(store.size).toBe(0);
    expect(loadOverlayPositions()).toEqual({});
  });

  it('survives corrupt storage and missing storage', () => {
    const store = installStorage();
    store.set('skyTrail.overlayPositions.v1', '{not json');
    expect(loadOverlayPositions()).toEqual({});
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveOverlayPositions({ hud: { x: 0, y: 0 } })).not.toThrow();
  });
});
