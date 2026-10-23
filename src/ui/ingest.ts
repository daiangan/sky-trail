/**
 * Turns picked or dropped files into lights in the project: lists them, reads
 * their headers several at a time with progress the user can cancel, skips
 * frames that are already loaded, and adds the rest in one update.
 */

import type { LightFileInfo } from '../fits';
import type { LightFrame } from '../model';
import { addSession } from '../model/project';
import { addLights, createSession } from '../model/session';
import { isAbortError } from '../util/pool';
import { isReadableFits, readLightBatches, type ScanOptions } from './file_io';
import {
  reportAllDuplicates,
  reportIngestFailure,
  reportIngestSuccess,
  reportNoFitsFiles,
} from './ingest_feedback';
import type { AppState } from './session_panel';
import type { Store } from './store';
import { showToast } from './toast';

/** The progress bar does not need more updates than this per second. */
const PROGRESS_INTERVAL_MS = 100;

let active: AbortController | null = null;

/** Stops the load in progress, if any; nothing it read is added. */
export function cancelIngest(): void {
  active?.abort();
}

export function lightFrameFromInfo(info: LightFileInfo, name: string): LightFrame {
  return {
    path: name,
    dateObs: info.dateObs,
    exptime: info.exptime,
    filterName: info.filterName,
    sizeBytes: info.sizeBytes,
    objRaDeg: info.objRaDeg,
    objDecDeg: info.objDecDeg,
    siteLatDeg: info.siteLatDeg,
    siteLonDeg: info.siteLonDeg,
    altDeg: null,
    azDeg: null,
  };
}

/**
 * Identity of a frame already in the project: the same file name, size and
 * capture instant. Frames without a date are never treated as duplicates,
 * because different nights routinely reuse names like `Light_001.fits`.
 */
export function frameKey(name: string, sizeBytes: number, dateObs: string | null): string | null {
  return dateObs === null ? null : `${name}|${sizeBytes}|${dateObs}`;
}

/**
 * Gathers files with `gather` (a picker or a drop) and loads them. Only one
 * load runs at a time; the store's `loading` state drives the progress bar.
 */
export async function loadFiles(
  store: Store<AppState>,
  gather: (options: Required<ScanOptions>) => Promise<File[] | { files: File[] } | null>,
): Promise<void> {
  if (active) {
    showToast({
      kind: 'info',
      message: 'Still reading files. Wait for it to finish or cancel it.',
    });
    return;
  }
  const controller = new AbortController();
  active = controller;
  try {
    const gathered = await gather({
      signal: controller.signal,
      onScan: throttled((found) =>
        setLoading(store, { phase: 'scanning', current: found, total: 0, fileName: '' }),
      ),
    });
    const files = gathered === null ? null : Array.isArray(gathered) ? gathered : gathered.files;
    if (files) await ingestFiles(files, store, controller.signal);
  } catch (error) {
    if (isAbortError(error)) {
      store.set((s) => ({ ...s, loading: null }));
      showToast({ kind: 'info', message: 'Loading cancelled. Nothing was added.' });
    } else {
      reportIngestFailure(store, error);
    }
  } finally {
    store.set((s) => (s.loading === null ? s : { ...s, loading: null }));
    active = null;
  }
}

export async function ingestFiles(
  files: File[],
  store: Store<AppState>,
  signal?: AbortSignal,
): Promise<void> {
  const fitsFiles = files.filter((f) => isReadableFits(f.name));
  if (fitsFiles.length === 0) {
    reportNoFitsFiles();
    return;
  }

  const report = throttled((current: number, total: number, fileName: string) =>
    setLoading(store, { phase: 'reading', current, total, fileName }),
  );
  const infos = await readLightBatches(fitsFiles, { signal, onProgress: report });

  // Frames already in the project (or repeated in this batch) are skipped.
  const seen = new Set<string>();
  for (const session of store.get().project.sessions) {
    for (const light of session.lights) {
      const key = frameKey(light.path, light.sizeBytes, light.dateObs);
      if (key) seen.add(key);
    }
  }
  const fresh: LightFrame[] = [];
  for (let i = 0; i < fitsFiles.length; i += 1) {
    const info = infos[i]!;
    const name = fitsFiles[i]!.name;
    const key = frameKey(name, info.sizeBytes, info.dateObs);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    fresh.push(lightFrameFromInfo(info, name));
  }
  const skipped = fitsFiles.length - fresh.length;
  if (fresh.length === 0) {
    store.set((s) => ({ ...s, loading: null }));
    reportAllDuplicates(skipped);
    return;
  }

  store.set((s) => {
    let project = s.project;
    let selectedId = s.selectedSessionId;

    // With no sessions yet, the first load creates "Night 1".
    if (project.sessions.length === 0) {
      project = addSession(project, createSession(0, 'Night 1'));
      selectedId = 0;
    } else if (selectedId === null) {
      selectedId = project.sessions.length - 1;
    }

    const session = project.sessions[selectedId];
    if (!session) return { ...s, loading: null };

    const sessions = project.sessions.slice();
    sessions[selectedId] = addLights(session, fresh);
    return {
      ...s,
      project: { ...project, sessions },
      selectedSessionId: selectedId,
      loading: null,
    };
  });
  reportIngestSuccess(store, fresh.length, skipped);
}

function setLoading(store: Store<AppState>, loading: NonNullable<AppState['loading']>): void {
  store.set((s) => ({ ...s, loading }));
}

/** Wraps `fn` so it runs at most once per `PROGRESS_INTERVAL_MS`; the calls in between are dropped. */
function throttled<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let last = -Infinity;
  return (...args) => {
    const now = performance.now();
    if (now - last < PROGRESS_INTERVAL_MS) return;
    last = now;
    fn(...args);
  };
}
