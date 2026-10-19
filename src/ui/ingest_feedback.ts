/**
 * User-facing feedback for loading FITS files. Without it, a drop with no
 * FITS files does nothing, a read that throws leaves the progress bar stuck,
 * and lights whose headers lack a date, target or site are dropped from the
 * animation without a word.
 */

import { buildTimeline } from '../model/timeline';
import type { AppState } from './session_panel';
import type { Store } from './store';
import { showToast } from './toast';

let openCoordinates: (() => void) | null = null;

/** Lets the "Set coordinates" toast action open the manual coordinates dialog. */
export function setCoordinatesOpener(opener: () => void): void {
  openCoordinates = opener;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function reportNoFitsFiles(): void {
  showToast({
    kind: 'warning',
    message: 'No FITS files found. SkyTrail reads .fits, .fit and .fts light frames.',
  });
}

export function reportIngestFailure(store: Store<AppState>, error: unknown): void {
  store.set((s) => ({ ...s, loading: null }));
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  showToast({ kind: 'error', message: `Could not read those files${detail}.` });
}

export interface IngestSummary {
  kind: 'success' | 'warning';
  message: string;
}

/** Pure wording for a finished load; `unplaced` lights lack a date, target or site. */
export function describeIngest(
  added: number,
  sessionName: string | null,
  totalLights: number,
  unplaced: number,
): IngestSummary {
  const where = sessionName ? ` to ${sessionName}` : '';
  const base = `Added ${plural(added, 'light')}${where}.`;
  if (unplaced > 0) {
    return {
      kind: 'warning',
      message: `${base} ${unplaced} of ${totalLights} can't be placed on the dome: their headers lack a date, target or site.`,
    };
  }
  return { kind: 'success', message: base };
}

/** Summarises a finished load: what was added and what can't be placed on the dome. */
export function reportIngestSuccess(store: Store<AppState>, added: number): void {
  const state = store.get();
  const session =
    state.selectedSessionId === null ? undefined : state.project.sessions[state.selectedSessionId];

  let total = 0;
  for (const s of state.project.sessions) total += s.lights.length;
  const unplaced = total - buildTimeline(state.project).length;

  const summary = describeIngest(added, session?.name ?? null, total, unplaced);
  if (summary.kind === 'warning') {
    showToast({
      kind: 'warning',
      message: summary.message,
      actionLabel: openCoordinates ? 'Set coordinates…' : undefined,
      onAction: openCoordinates ?? undefined,
    });
    return;
  }
  showToast({ kind: 'success', message: summary.message });
}
