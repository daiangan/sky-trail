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
import { hasPosition, type LightFrame } from './light_frame';
import type { Project } from './project';
import { allLights } from './project';
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

  const withDate = positioned.filter((p) => p.light.dateObs !== null);
  const withoutDate = positioned.filter((p) => p.light.dateObs === null);
  withDate.sort((a, b) => a.light.dateObs!.localeCompare(b.light.dateObs!));

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

/**
 * "1.00 GB" for 1024**3; "0.42 GB" for 450 MB; always rendered in GB with
 * two decimals, matching the Python `format_gb`.
 */
export function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0.00 GB';
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export type { FallbackCoordinates };
