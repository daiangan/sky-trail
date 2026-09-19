/**
 * Robust parsing for FITS date-time timestamps (primarily DATE-OBS).
 *
 * The FITS standard (FITS 4.0, section 9.1.1) specifies that DATE-OBS is in UTC.
 * However, acquisition software (N.I.N.A., ASIAIR, StellaVita, Ekos, APT, etc.)
 * typically writes ISO strings without a trailing 'Z' (e.g. "2026-09-15T06:00:00.000"
 * or "2026-09-15 06:00:00").
 *
 * In ECMAScript, `new Date("YYYY-MM-DDTHH:mm:ss")` without a timezone suffix is
 * parsed as LOCAL TIME by default. In timezones behind UTC (such as UTC-4 in the
 * Americas), this erroneously shifts observation timestamps hours into the future,
 * rotating the celestial dome westward by 15 degrees per hour of offset.
 *
 * This utility guarantees that FITS timestamps without an explicit timezone
 * are parsed strictly as UTC.
 */

export function parseFitsDate(raw: string | null | undefined): Date | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Replace space separator with 'T' if present (e.g. "2026-09-15 06:00:00" -> "2026-09-15T06:00:00")
  let normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:)/, '$1T$2');

  // Check if string already contains a timezone indicator (Z or +/-HH:mm)
  const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized);

  if (!hasTimezone) {
    // If it's a date+time string without timezone, append 'Z' to force UTC
    if (normalized.includes('T')) {
      normalized = `${normalized}Z`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      // Date-only string: force UTC midnight
      normalized = `${normalized}T00:00:00Z`;
    }
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
