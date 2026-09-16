/**
 * Parses sexagesimal coordinate strings into decimal degrees.
 *
 * Two coordinate units are supported:
 *   - "hours":   OBJCTRA-style values like "05 35 17.3"   (1 hour  = 15 degrees)
 *   - "degrees": OBJCTDEC-style values like "-05 23 28"
 *
 * Separators may be spaces or colons; any whitespace sequence is collapsed.
 * Trailing components may be omitted (a 2-part value is treated as D M,
 * a 1-part value as D). A leading '+' or '-' is honoured on the first
 * component; for a positive hours value the leading '+' may be absent.
 *
 * Returns null for unparsable input -- callers treat null as "fall back
 * to project-level manual coordinates".
 */

export type SexagesimalUnit = 'hours' | 'degrees';

export function parseSexagesimal(input: string, unit: SexagesimalUnit): number | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  const parts = text.split(/[\s:]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return null;

  let sign = 1;
  const first = parts[0]!;
  let head = first;
  if (head.startsWith('-')) {
    sign = -1;
    head = head.slice(1);
  } else if (head.startsWith('+')) {
    head = head.slice(1);
  }

  const numbers: number[] = [];
  for (const part of [head, ...parts.slice(1)]) {
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    numbers.push(n);
  }

  const degrees = (numbers[0] ?? 0) + (numbers[1] ?? 0) / 60 + (numbers[2] ?? 0) / 3600;

  const inDegrees = unit === 'hours' ? degrees * 15 : degrees;
  return sign * inDegrees;
}

/**
 * Parses a plain decimal-degrees string like "40.000000" or "-3.7".
 * Used for SITELAT / SITELONG and as the fallback for OBJCTRA / OBJCTDEC
 * when the acquisition software writes the keyword in decimal form.
 */
export function parseDecimalDegrees(input: string): number | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
