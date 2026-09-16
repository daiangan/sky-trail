/**
 * A SkyTrail project: a named stack of capture sessions plus the
 * project-level fallback coordinates that get filled in when a light's
 * FITS header doesn't carry its own RA/Dec/Lat/Lon. The fallback
 * coordinates are remembered across browser sessions via localStorage
 * (see `model/persistence.ts`).
 */

import type { LightFrame } from './light_frame';
import type { Session } from './session';
import { sessionLightCount, sessionTotalBytes, sessionTotalExptimeS } from './session';

export interface Project {
  name: string;
  sessions: Session[];
  fallbackObjRaDeg: number | null;
  fallbackObjDecDeg: number | null;
  fallbackSiteLatDeg: number | null;
  fallbackSiteLonDeg: number | null;
}

export function createProject(name: string = 'Untitled project'): Project {
  return {
    name,
    sessions: [],
    fallbackObjRaDeg: null,
    fallbackObjDecDeg: null,
    fallbackSiteLatDeg: null,
    fallbackSiteLonDeg: null,
  };
}

export function totalLightCount(project: Project): number {
  let total = 0;
  for (const session of project.sessions) total += sessionLightCount(session);
  return total;
}

export function totalExptimeS(project: Project): number {
  let total = 0;
  for (const session of project.sessions) total += sessionTotalExptimeS(session);
  return total;
}

export function totalBytes(project: Project): number {
  let total = 0;
  for (const session of project.sessions) total += sessionTotalBytes(session);
  return total;
}

export interface LightInProject {
  light: LightFrame;
  nightIndex: number;
}

export function allLights(project: Project): LightInProject[] {
  const out: LightInProject[] = [];
  for (let i = 0; i < project.sessions.length; i += 1) {
    const nightIndex = i + 1;
    for (const light of project.sessions[i]!.lights) {
      out.push({ light, nightIndex });
    }
  }
  return out;
}

export function addSession(project: Project, session: Session): Project {
  return { ...project, sessions: [...project.sessions, session] };
}

export function removeSession(project: Project, index: number): Project {
  return {
    ...project,
    sessions: project.sessions.filter((_, i) => i !== index),
  };
}

export function moveSession(project: Project, from: number, to: number): Project {
  if (from === to) return project;
  if (from < 0 || from >= project.sessions.length) return project;
  if (to < 0 || to >= project.sessions.length) return project;
  const sessions = [...project.sessions];
  const [moved] = sessions.splice(from, 1);
  sessions.splice(to, 0, moved!);
  return { ...project, sessions };
}

export function setFallbackCoords(
  project: Project,
  coords: Partial<{
    raDeg: number | null;
    decDeg: number | null;
    latDeg: number | null;
    lonDeg: number | null;
  }>,
): Project {
  return {
    ...project,
    fallbackObjRaDeg: coords.raDeg !== undefined ? coords.raDeg : project.fallbackObjRaDeg,
    fallbackObjDecDeg: coords.decDeg !== undefined ? coords.decDeg : project.fallbackObjDecDeg,
    fallbackSiteLatDeg: coords.latDeg !== undefined ? coords.latDeg : project.fallbackSiteLatDeg,
    fallbackSiteLonDeg: coords.lonDeg !== undefined ? coords.lonDeg : project.fallbackSiteLonDeg,
  };
}
