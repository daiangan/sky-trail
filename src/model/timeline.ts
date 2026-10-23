/**
 * Animation timeline: a single, pre-computed list of `TimelinePoint`s
 * that both the live preview and the video exporter walk in order.
 * Pre-computing the cumulative counters once -- rather than recomputing
 * on every frame -- guarantees the live preview and the exported video
 * can never drift apart.
 *
 * Per section 3.5 of the migration prompt:
 *   - Lights without a resolved position are silently excluded.
 *   - Lights with DATE-OBS sort first, ascending by DATE-OBS.
 *   - Lights without DATE-OBS sort last, in their original assignment
 *     order (i.e. the order returned by `allLights()`).
 */

import { computeAltAz } from '../astro/altaz';
import { parseFitsDate } from '../astro/date_parse';
import { hasPosition, type LightFrame } from './light_frame';
import type { Project } from './project';
import { allLights, hasSameLights } from './project';
import {
  projectFallback,
  resolveLightPosition,
  type AltAzFn,
  type FallbackCoordinates,
} from './resolve';

export interface TimelinePoint {
  light: LightFrame;
  nightIndex: number;
  totalNights: number;
  cumulativeExptimeS: number;
  cumulativeSubframes: number;
  cumulativeBytes: number;
}

const defaultAltAz: AltAzFn = (when, observer, target) => computeAltAz(when, observer, target);

export function buildTimeline(project: Project, altaz: AltAzFn = defaultAltAz): TimelinePoint[] {
  const fallback = projectFallback(project);
  const positioned: { light: LightFrame; nightIndex: number; order: number }[] = [];
  let order = 0;
  for (const { light, nightIndex } of allLights(project)) {
    const resolved = resolveLightPosition(light, fallback, altaz);
    if (!hasPosition(resolved)) continue;
    positioned.push({ light: resolved, nightIndex, order: order++ });
  }

  // Sort by the parsed instant, not the raw string: DATE-OBS comes in several
  // spellings (space or "T" separator, with or without "Z" or an offset), and
  // comparing those as text puts some earlier frames after later ones. The
  // sort is stable, so equal instants keep their assignment order.
  const dated = positioned.map((p) => ({
    ...p,
    ms: parseFitsDate(p.light.dateObs)?.getTime() ?? null,
  }));
  const withDate = dated.filter((p) => p.ms !== null).sort((a, b) => a.ms! - b.ms!);
  const withoutDate = dated.filter((p) => p.ms === null);

  const sorted = [...withDate, ...withoutDate];
  const totalNights = project.sessions.length;

  let cumExptime = 0;
  let cumSubframes = 0;
  let cumBytes = 0;
  return sorted.map(({ light, nightIndex }) => {
    cumExptime += light.exptime ?? 0;
    cumSubframes += 1;
    cumBytes += light.sizeBytes;
    return {
      light,
      nightIndex,
      totalNights,
      cumulativeExptimeS: cumExptime,
      cumulativeSubframes: cumSubframes,
      cumulativeBytes: cumBytes,
    };
  });
}

let cachedProject: Project | null = null;
let cachedTimeline: TimelinePoint[] = [];

/**
 * The timeline of `project`, computed once and shared. The dome, the overlay and
 * the load summary all need it for the same project, and renaming or recolouring
 * a session does not change it, so the previous result is reused in that case.
 * Callers must treat the returned list as read-only.
 */
export function timelineOf(project: Project): TimelinePoint[] {
  if (cachedProject && hasSameLights(cachedProject, project)) {
    cachedProject = project;
    return cachedTimeline;
  }
  cachedTimeline = buildTimeline(project);
  cachedProject = project;
  return cachedTimeline;
}

/**
 * "1h 30m" for 5400 seconds; "1h 00m" for 3600; "0h 05m" for 300.
 * Mirrors the Python `format_duration` (rounded, zero-padded minutes).
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

const DATA_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * Data volume in the largest unit that keeps the number readable:
 * "500 B", "168.8 KB", "512.0 MB", "1.43 GB". A fixed unit would show
 * anything under 5 MB as "0.00 GB", which tells the user nothing.
 */
export function formatDataSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  let unit = 0;
  let value = bytes;
  while (value >= 1024 && unit < DATA_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimalsFor = (u: number) => (u === 0 ? 0 : u === DATA_UNITS.length - 1 ? 2 : 1);
  // Rounding can tip 1023.97 up to "1024.0"; show that in the next unit instead.
  if (unit < DATA_UNITS.length - 1 && Number(value.toFixed(decimalsFor(unit))) >= 1024) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(decimalsFor(unit))} ${DATA_UNITS[unit]}`;
}

export type { FallbackCoordinates };
