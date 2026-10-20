import { describe, expect, it } from 'vitest';
import { generateDemoSessions } from '../../src/demo/demo_data';
import { createProject } from '../../src/model';
import type { LightFrame } from '../../src/model/light_frame';
import { createSession } from '../../src/model/session';
import { clearDemo } from '../../src/ui/demo_loader';
import type { AppState } from '../../src/ui/session_panel';
import { Store } from '../../src/ui/store';

function userLight(path: string): LightFrame {
  return {
    path,
    dateObs: '2026-01-01T20:00:00',
    exptime: 60,
    filterName: null,
    sizeBytes: 1,
    objRaDeg: 10,
    objDecDeg: 10,
    siteLatDeg: 40,
    siteLonDeg: -3,
    altDeg: null,
    azDeg: null,
  };
}

function makeStore(sessions: AppState['project']['sessions'], selected: number | null) {
  return new Store<AppState>({
    project: { ...createProject('test'), sessions },
    selectedSessionId: selected,
    loading: null,
    playback: {
      revealProgress: 0,
      revealCount: 0,
      timelineLength: 0,
      pointsPerSecond: 5,
      isPlaying: false,
      isFinished: false,
    },
    overlay: { visible: true, counter: true, stats: true, chart: true },
    overlayPositions: {},
  });
}

const demo = generateDemoSessions();
const demoPaths = new Set(demo.flatMap((session) => session.lights.map((l) => l.path)));

describe('clearDemo', () => {
  it('removes every demo session and returns to an empty project', () => {
    const store = makeStore(demo, 2);
    clearDemo(store, demoPaths);
    expect(store.get().project.sessions).toEqual([]);
    expect(store.get().selectedSessionId).toBeNull();
  });

  it('keeps sessions the user created themselves', () => {
    const own = { ...createSession(0, 'My night'), lights: [userLight('own_1.fits')] };
    const store = makeStore([own, ...demo], 0);
    clearDemo(store, demoPaths);
    expect(store.get().project.sessions.map((s) => s.name)).toEqual(['My night']);
    expect(store.get().selectedSessionId).toBe(0);
  });

  it('keeps files the user dropped into a demo session, and drops only the demo frames', () => {
    const mixed = { ...demo[0]!, lights: [...demo[0]!.lights, userLight('own_2.fits')] };
    const store = makeStore([mixed, ...demo.slice(1)], 0);
    clearDemo(store, demoPaths);
    const sessions = store.get().project.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.name).toBe('Object 1 · Night 1');
    expect(sessions[0]!.lights.map((l) => l.path)).toEqual(['own_2.fits']);
  });

  it('keeps the other project settings', () => {
    const store = makeStore(demo, null);
    store.set((s) => ({ ...s, project: { ...s.project, fallbackSiteLatDeg: 12.5 } }));
    clearDemo(store, demoPaths);
    expect(store.get().project.fallbackSiteLatDeg).toBe(12.5);
  });
});
