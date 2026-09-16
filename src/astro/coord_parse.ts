/**
 * Manual coordinate entry parser. Used both for the project-level fallback
 * coordinates (when a light's FITS header doesn't carry OBJCTRA/OBJCTDEC
 * or SITELAT/SITELONG) and for any UI surface that asks the user to type
 * RA/Dec/Lat/Lon in.
 *
 * Format detection follows the desktop tool: a value containing ':' (or
 * any whitespace-separated multi-component value) is treated as
 * sexagesimal; otherwise it's parsed as decimal degrees. Returns null for
 * unparsable input -- callers are expected to surface the error in the UI
 * rather than throw.
 */

import { parseDecimalDegrees, parseSexagesimal } from '../fits/sexagesimal';

export function parseManualRa(text: string): number | null {
  if (!looksSexagesimal(text)) return parseDecimalDegrees(text);
  return parseSexagesimal(text, 'hours');
}

export function parseManualDec(text: string): number | null {
  if (!looksSexagesimal(text)) return parseDecimalDegrees(text);
  return parseSexagesimal(text, 'degrees');
}

export function parseManualLatitude(text: string): number | null {
  return parseDecimalDegrees(text);
}

export function parseManualLongitude(text: string): number | null {
  return parseDecimalDegrees(text);
}

function looksSexagesimal(text: string): boolean {
  return text.includes(':') || /\s/.test(text);
}
