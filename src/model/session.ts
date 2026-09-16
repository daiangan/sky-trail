/**
 * A capture "night" -- a named group of light frames that share a
 * single arc on the dome. The `color` is a hex string drawn from the
 * default rotating palette (see `DEFAULT_SESSION_PALETTE`), unless the
 * user overrides it.
 */

import type { LightFrame } from './light_frame';

export const DEFAULT_SESSION_PALETTE: readonly string[] = [
  '#4fc3f7',
  '#ef5350',
  '#66bb6a',
  '#ffca28',
  '#ab47bc',
  '#ff7043',
  '#26c6da',
  '#ec407a',
  '#9ccc65',
  '#8d6e63',
];

export interface Session {
  name: string;
  color: string;
  lights: LightFrame[];
}

export function defaultSessionColor(index: number): string {
  const palette = DEFAULT_SESSION_PALETTE;
  const i = ((index % palette.length) + palette.length) % palette.length;
  return palette[i]!;
}

export function createSession(
  index: number,
  name: string = defaultSessionName(index),
  color: string = defaultSessionColor(index),
): Session {
  return { name, color, lights: [] };
}

export function defaultSessionName(index: number): string {
  return `Night ${index + 1}`;
}

export function sessionLightCount(session: Session): number {
  return session.lights.length;
}

export function sessionTotalExptimeS(session: Session): number {
  let total = 0;
  for (const light of session.lights) total += light.exptime ?? 0;
  return total;
}

export function sessionTotalBytes(session: Session): number {
  let total = 0;
  for (const light of session.lights) total += light.sizeBytes;
  return total;
}

/**
 * Earliest DATE-OBS in the session, or null if no light has one.
 * Used by the session-list UI as the "session date" summary.
 */
export function sessionDate(session: Session): string | null {
  let earliest: string | null = null;
  for (const light of session.lights) {
    if (!light.dateObs) continue;
    if (earliest === null || light.dateObs < earliest) earliest = light.dateObs;
  }
  return earliest;
}

export function addLight(session: Session, light: LightFrame): Session {
  return { ...session, lights: [...session.lights, light] };
}

export function renameSession(session: Session, name: string): Session {
  return { ...session, name };
}

export function setSessionColor(session: Session, color: string): Session {
  return { ...session, color };
}
