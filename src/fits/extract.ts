/**
 * Pulls the handful of header fields SkyTrail actually needs from a
 * parsed FITS header record. Any missing or unparsable keyword becomes
 * `null` here -- callers (the data model, the positioning layer) are
 * responsible for falling back to project-level manual coordinates.
 *
 * Mirrors the Python project's `astro.fits_reader.LightHeaderData`.
 */

import { parseDecimalDegrees, parseSexagesimal } from './sexagesimal';
import type { FitsHeader } from './header';

export interface LightMetadata {
  /** DATE-OBS, preserved as the raw ISO 8601 string (e.g. "2026-09-15T06:21:38.8822612"). */
  dateObs: string | null;
  /** EXPTIME in seconds (number). */
  exptime: number | null;
  /** FILTER (string, may be a filter wheel position name like "SV220"). */
  filterName: string | null;
  /** OBJCTRA in decimal degrees. */
  objRaDeg: number | null;
  /** OBJCTDEC in decimal degrees. */
  objDecDeg: number | null;
  /** SITELAT in decimal degrees. */
  siteLatDeg: number | null;
  /** SITELONG in decimal degrees. */
  siteLonDeg: number | null;
}

export interface LightFileInfo extends LightMetadata {
  /** File size in bytes. */
  sizeBytes: number;
}

export function extractLightMetadata(header: FitsHeader): LightMetadata {
  const dateObs = normalizeDateObs(header['DATE-OBS']);
  const exptime = normalizeExptime(header['EXPTIME']);
  const filterName = normalizeFilter(header['FILTER']);
  const objRaDeg = normalizeCoordinate(header['OBJCTRA'], 'hours');
  const objDecDeg = normalizeCoordinate(header['OBJCTDEC'], 'degrees');
  const siteLatDeg = normalizeDecimal(header['SITELAT']);
  const siteLonDeg = normalizeDecimal(header['SITELONG']);

  return {
    dateObs,
    exptime,
    filterName,
    objRaDeg,
    objDecDeg,
    siteLatDeg,
    siteLonDeg,
  };
}

function normalizeDateObs(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text || null;
}

function normalizeExptime(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeFilter(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text || null;
}

function normalizeDecimal(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') return parseDecimalDegrees(raw);
  return null;
}

function normalizeCoordinate(raw: unknown, unit: 'hours' | 'degrees'): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return unit === 'hours' ? raw * 15 : raw;
  }
  if (typeof raw === 'string') {
    const sex = parseSexagesimal(raw, unit);
    if (sex !== null) return sex;
    return parseDecimalDegrees(raw);
  }
  return null;
}
