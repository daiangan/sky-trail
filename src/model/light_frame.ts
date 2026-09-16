/**
 * A single light frame: raw data extracted from a FITS header, plus the
 * horizontal coordinates (Alt/Az) computed by `astro/altaz.ts` after the
 * project-level fallback (in `model/resolve.ts`) has filled in any
 * missing RA/Dec/Lat/Lon.
 *
 * `path` is the original file identifier (a File name, a relative path
 * inside a picked folder, etc.) -- just enough to identify the light in
 * the session list and reproduce it in an export manifest.
 */

export interface LightFrame {
  path: string;
  dateObs: string | null;
  exptime: number | null;
  filterName: string | null;
  sizeBytes: number;
  objRaDeg: number | null;
  objDecDeg: number | null;
  siteLatDeg: number | null;
  siteLonDeg: number | null;
  altDeg: number | null;
  azDeg: number | null;
}

export function hasPosition(light: LightFrame): boolean {
  return light.altDeg !== null && light.azDeg !== null;
}
