/**
 * Pulls the handful of header fields SkyTrail actually needs from a
 * parsed FITS header record. Any missing or unparsable keyword becomes
 * `null` here -- callers (the data model, the positioning layer) are
 * responsible for falling back to project-level manual coordinates.
 *
 * Supports header conventions from:
 *   - N.I.N.A. (OBJCTRA/OBJCTDEC sexagesimal, SITELAT/SITELONG, DATE-OBS UTC)
 *   - ASIAIR (RA/DEC decimal degrees or sexagesimal, SITELAT/SITELONG, CRVAL1/2)
 *   - StellaVita / ToupTek (RA/DEC, DATE-OBS, SITELAT/SITELONG)
 *   - Ekos / INDI / APT / SharpCap / Siril (LATITUDE/LONGITUD, TIME-OBS)
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
  /** Target RA in decimal degrees. */
  objRaDeg: number | null;
  /** Target Dec in decimal degrees. */
  objDecDeg: number | null;
  /** Observer latitude in decimal degrees (-90 to +90). */
  siteLatDeg: number | null;
  /** Observer longitude in decimal degrees (-180 to +180, East positive, West negative). */
  siteLonDeg: number | null;
}

export interface LightFileInfo extends LightMetadata {
  /** File size in bytes. */
  sizeBytes: number;
}

export function extractLightMetadata(header: FitsHeader): LightMetadata {
  const dateObs = extractDateObs(header);
  const exptime = normalizeExptime(header['EXPTIME'] ?? header['EXPOSURE']);
  const filterName = normalizeFilter(header['FILTER'] ?? header['FILTNAME']);
  const objRaDeg = extractRaDeg(header);
  const objDecDeg = extractDecDeg(header);
  const siteLatDeg = extractSiteLat(header);
  const siteLonDeg = extractSiteLon(header);

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

function extractDateObs(header: FitsHeader): string | null {
  const primary = header['DATE-OBS'] ?? header['DATE-AVG'] ?? header['DATE'];
  if (typeof primary !== 'string') return null;

  const dateStr = primary.trim();
  if (!dateStr) return null;

  // If DATE-OBS is date-only (e.g. "2026-09-15") and separate TIME-OBS exists
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const timeObs = header['TIME-OBS'] ?? header['UT-START'] ?? header['UTC-OBS'];
    if (typeof timeObs === 'string' && timeObs.trim()) {
      return `${dateStr}T${timeObs.trim()}`;
    }
  }

  return dateStr;
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

function extractRaDeg(header: FitsHeader): number | null {
  // 1. OBJCTRA: standard keyword, typically sexagesimal hours or decimal hours
  if (header['OBJCTRA'] !== undefined) {
    const parsed = normalizeCoordinate(header['OBJCTRA'], 'hours');
    if (parsed !== null) return parsed;
  }

  // 2. RA: widely used by ASIAIR and StellaVita (numeric degrees, or sexagesimal string)
  if (header['RA'] !== undefined) {
    const val = header['RA'];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return normalizeDegrees360(val);
    }
    if (typeof val === 'string') {
      const parsedSex = parseSexagesimal(val, 'hours');
      if (parsedSex !== null) return normalizeDegrees360(parsedSex);
      const parsedDec = parseDecimalDegrees(val);
      if (parsedDec !== null) return normalizeDegrees360(parsedDec);
    }
  }

  // 3. CRVAL1: WCS reference pixel RA in decimal degrees (e.g. plate-solved frames)
  if (header['CRVAL1'] !== undefined) {
    const val = header['CRVAL1'];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return normalizeDegrees360(val);
    }
    if (typeof val === 'string') {
      const parsedDec = parseDecimalDegrees(val);
      if (parsedDec !== null) return normalizeDegrees360(parsedDec);
    }
  }

  return null;
}

function extractDecDeg(header: FitsHeader): number | null {
  // 1. OBJCTDEC: standard keyword, sexagesimal degrees or decimal degrees
  if (header['OBJCTDEC'] !== undefined) {
    const parsed = normalizeCoordinate(header['OBJCTDEC'], 'degrees');
    if (parsed !== null) return parsed;
  }

  // 2. DEC: widely used by ASIAIR and StellaVita (numeric degrees or sexagesimal)
  if (header['DEC'] !== undefined) {
    const val = header['DEC'];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    if (typeof val === 'string') {
      const parsedSex = parseSexagesimal(val, 'degrees');
      if (parsedSex !== null) return parsedSex;
      const parsedDec = parseDecimalDegrees(val);
      if (parsedDec !== null) return parsedDec;
    }
  }

  // 3. CRVAL2: WCS reference pixel Dec in decimal degrees
  if (header['CRVAL2'] !== undefined) {
    const val = header['CRVAL2'];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    if (typeof val === 'string') {
      const parsedDec = parseDecimalDegrees(val);
      if (parsedDec !== null) return parsedDec;
    }
  }

  return null;
}

function extractSiteLat(header: FitsHeader): number | null {
  const candidates = [header['SITELAT'], header['LATITUDE'], header['OBS-LAT'], header['SITELATD']];
  for (const raw of candidates) {
    if (raw === undefined) continue;
    const parsed = parseLatitudeOrLongitude(raw);
    if (parsed !== null && parsed >= -90 && parsed <= 90) return parsed;
  }
  return null;
}

function extractSiteLon(header: FitsHeader): number | null {
  const candidates = [header['SITELONG'], header['LONGITUD'], header['OBS-LONG'], header['SITELOND']];
  for (const raw of candidates) {
    if (raw === undefined) continue;
    const parsed = parseLatitudeOrLongitude(raw);
    if (parsed !== null) {
      return normalizeLongitude(parsed);
    }
  }
  return null;
}

function parseLatitudeOrLongitude(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const sex = parseSexagesimal(raw, 'degrees');
    if (sex !== null) return sex;
    return parseDecimalDegrees(raw);
  }
  return null;
}

/**
 * Normalizes longitude to [-180, +180] degrees (East positive, West negative).
 * Preserves exact float if already in range.
 * Some software records West longitude in [180, 360) (e.g. 290° instead of -70°).
 */
function normalizeLongitude(lon: number): number {
  if (lon >= -180 && lon <= 180) {
    return lon;
  }
  let wrapped = ((lon % 360) + 360) % 360;
  if (wrapped > 180) {
    wrapped -= 360;
  }
  return wrapped;
}

function normalizeDegrees360(deg: number): number {
  return ((deg % 360) + 360) % 360;
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
