/**
 * Loads the simulated demo (see demo/demo_data.ts) into the app, and removes
 * it again. Nothing real is involved, so the user is told plainly that this is
 * demo data and is offered a one-click way to clear it.
 */

import { generateDemoSessions } from '../demo/demo_data';
import type { AppState } from './session_panel';
import type { Store } from './store';
import { showToast } from './toast';

const DEMO_TOAST_MS = 20000;

/** Replaces the (empty) project's sessions with the demo and explains what it is. */
export function loadDemo(store: Store<AppState>): void {
  const sessions = generateDemoSessions();
  const demoPaths = new Set(sessions.flatMap((session) => session.lights.map((l) => l.path)));

  store.set((s) => ({
    ...s,
    project: { ...s.project, sessions },
    selectedSessionId: null,
  }));

  showToast({
    kind: 'info',
    message: 'Simulated demo data: 2 objects, 2 nights each. These are not real captures.',
    actionLabel: 'Clear demo',
    onAction: () => clearDemo(store, demoPaths),
    durationMs: DEMO_TOAST_MS,
  });
}

/**
 * Removes the demo's frames and any session left empty, keeping everything the
 * user added since, even if they dropped files into a demo session.
 */
export function clearDemo(store: Store<AppState>, demoPaths: ReadonlySet<string>): void {
  store.set((s) => {
    const sessions = s.project.sessions
      .map((session) => ({
        ...session,
        lights: session.lights.filter((light) => !demoPaths.has(light.path)),
      }))
      .filter((session) => session.lights.length > 0);
    const selected = s.selectedSessionId;
    return {
      ...s,
      project: { ...s.project, sessions },
      selectedSessionId: selected !== null && selected < sessions.length ? selected : null,
    };
  });
}
