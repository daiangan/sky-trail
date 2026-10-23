import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../../src/model';
import { createSession } from '../../src/model/session';
import { frameKey, ingestFiles, loadFiles } from '../../src/ui/ingest';
import type { AppState } from '../../src/ui/session_panel';
import { Store } from '../../src/ui/store';
import { buildFitsBuffer } from '../fits/_helpers';

const toasts: { kind?: string; message: string }[] = [];
vi.mock('../../src/ui/toast', () => ({
  showToast: (options: { kind?: string; message: string }) => {
    toasts.push(options);
    return () => undefined;
  },
}));

function makeStore(): Store<AppState> {
  return new Store<AppState>({
    project: createProject('test'),
    selectedSessionId: null,
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

function fitsFile(name: string, dateObs: string | null): File {
  const cards: Array<readonly [string, string | number]> = [
    ['EXPTIME', 60],
    ['OBJCTRA', '05 35 17'],
    ['OBJCTDEC', '-05 23 28'],
    ['SITELAT', 40],
    ['SITELONG', -3.7],
  ];
  if (dateObs) cards.push(['DATE-OBS', dateObs]);
  return new File([buildFitsBuffer(cards)], name);
}

beforeEach(() => {
  toasts.length = 0;
});

describe('frameKey', () => {
  it('identifies a frame by name, size and capture instant', () => {
    expect(frameKey('a.fits', 10, '2026-01-01T20:00:00')).toBe('a.fits|10|2026-01-01T20:00:00');
  });

  it('never identifies a frame without a date, so reused names across nights survive', () => {
    expect(frameKey('Light_001.fits', 10, null)).toBeNull();
  });
});

describe('ingestFiles', () => {
  it('adds the files to a new Night 1 in the order given', async () => {
    const store = makeStore();
    await ingestFiles(
      [fitsFile('b.fits', '2026-01-01T20:01:00'), fitsFile('a.fits', '2026-01-01T20:00:00')],
      store,
    );
    const { project, selectedSessionId, loading } = store.get();
    expect(project.sessions.map((s) => s.name)).toEqual(['Night 1']);
    expect(project.sessions[0]!.lights.map((l) => l.path)).toEqual(['b.fits', 'a.fits']);
    expect(selectedSessionId).toBe(0);
    expect(loading).toBeNull();
  });

  it('skips frames that are already loaded and says so', async () => {
    const store = makeStore();
    const files = [
      fitsFile('a.fits', '2026-01-01T20:00:00'),
      fitsFile('b.fits', '2026-01-01T20:01:00'),
    ];
    await ingestFiles(files, store);
    await ingestFiles([...files, fitsFile('c.fits', '2026-01-01T20:02:00')], store);
    expect(store.get().project.sessions[0]!.lights.map((l) => l.path)).toEqual([
      'a.fits',
      'b.fits',
      'c.fits',
    ]);
    expect(toasts.at(-1)!.message).toContain('2 files already loaded, skipped');
  });

  it('reports when every file was already loaded and leaves the project untouched', async () => {
    const store = makeStore();
    const files = [fitsFile('a.fits', '2026-01-01T20:00:00')];
    await ingestFiles(files, store);
    const before = store.get().project;
    await ingestFiles(files, store);
    expect(store.get().project).toBe(before);
    expect(toasts.at(-1)!.message).toBe('That file is already loaded.');
  });

  it('keeps undated frames that share a name with an earlier night', async () => {
    const store = makeStore();
    await ingestFiles([fitsFile('Light_001.fits', null)], store);
    store.set((s) => ({
      ...s,
      project: { ...s.project, sessions: [...s.project.sessions, createSession(1)] },
      selectedSessionId: 1,
    }));
    await ingestFiles([fitsFile('Light_001.fits', null)], store);
    expect(store.get().project.sessions.map((s) => s.lights.length)).toEqual([1, 1]);
  });

  it('ignores hidden companion files', async () => {
    const store = makeStore();
    await ingestFiles(
      [fitsFile('._a.fits', '2026-01-01T20:00:00'), fitsFile('a.fits', '2026-01-01T20:00:00')],
      store,
    );
    expect(store.get().project.sessions[0]!.lights.map((l) => l.path)).toEqual(['a.fits']);
  });
});

describe('loadFiles', () => {
  it('adds what the gatherer returns and clears the loading state', async () => {
    const store = makeStore();
    await loadFiles(store, async () => [fitsFile('a.fits', '2026-01-01T20:00:00')]);
    expect(store.get().project.sessions[0]!.lights).toHaveLength(1);
    expect(store.get().loading).toBeNull();
  });

  it('does nothing when the picker is cancelled', async () => {
    const store = makeStore();
    await loadFiles(store, async () => null);
    expect(store.get().project.sessions).toHaveLength(0);
    expect(toasts).toHaveLength(0);
  });

  it('adds nothing and says so when the load is cancelled', async () => {
    const store = makeStore();
    await loadFiles(store, async ({ signal }) => {
      const { cancelIngest } = await import('../../src/ui/ingest');
      cancelIngest();
      expect(signal.aborted).toBe(true);
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    });
    expect(store.get().project.sessions).toHaveLength(0);
    expect(store.get().loading).toBeNull();
    expect(toasts.at(-1)!.message).toBe('Loading cancelled. Nothing was added.');
  });

  it('refuses a second load while one is running', async () => {
    const store = makeStore();
    let release!: () => void;
    const first = loadFiles(
      store,
      () => new Promise((resolve) => (release = () => resolve([fitsFile('a.fits', null)]))),
    );
    await loadFiles(store, async () => [fitsFile('b.fits', null)]);
    expect(toasts.at(-1)!.message).toContain('Still reading');
    release();
    await first;
    expect(store.get().project.sessions[0]!.lights.map((l) => l.path)).toEqual(['a.fits']);
  });
});
