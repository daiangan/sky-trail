/**
 * Low-level FITS primary-header parser. Reads the first one or two
 * 2880-byte blocks of a FITS file and returns every keyword/value pair
 * found up to (and not including) the END card.
 *
 * Deliberately narrow: this is the only FITS code we ship, and the rest
 * of the app talks to the structured record returned by
 * `extractLightMetadata` in `./extract.ts`. Pixel data is never touched --
 * we stop at the END card and never read past byte 5760.
 *
 * Card format reminder (FITS standard 4.0, section 4):
 *   cols 1-8   keyword (A-Z, 0-9, '-', '_'; uppercase)
 *   cols 9-10  '= ' (either may be the '=' in practice)
 *   cols 11-30 value field
 *   col  31    optional ' ' before '/' comment
 *   col  32+   '/'-prefixed comment
 */

export type FitsValue = string | number | boolean;

export type FitsHeader = Record<string, FitsValue>;

const RECORD_BYTES = 2880;
const CARD_BYTES = 80;
const MAX_HEADER_BYTES = RECORD_BYTES * 2;

export function parseFitsHeader(bytes: Uint8Array): FitsHeader {
  const header: FitsHeader = {};
  const limit = Math.min(bytes.length, MAX_HEADER_BYTES);

  for (let offset = 0; offset + CARD_BYTES <= limit; offset += CARD_BYTES) {
    const card = readCard(bytes, offset);
    const keyword = card.keyword;
    if (keyword === 'END') break;
    if (!keyword) continue;
    if (card.value === undefined) continue;
    header[keyword] = card.value;
  }

  return header;
}

interface ParsedCard {
  keyword: string;
  value: FitsValue | undefined;
}

function readCard(bytes: Uint8Array, offset: number): ParsedCard {
  const raw = bytes.subarray(offset, offset + CARD_BYTES);
  const text = bytesToAscii(raw);
  const keyword = text.slice(0, 8).trim().toUpperCase();

  if (!keyword) return { keyword: '', value: undefined };

  const eqIndex = text.indexOf('=');
  if (eqIndex === -1) return { keyword, value: undefined };

  const valueField =
    text
      .slice(eqIndex + 1)
      .split('/')[0]
      ?.trim() ?? '';
  if (!valueField) return { keyword, value: '' };

  const first = valueField[0]!;
  if (first === "'") {
    return { keyword, value: parseFitsString(valueField) };
  }
  if (valueField === 'T') return { keyword, value: true };
  if (valueField === 'F') return { keyword, value: false };

  const numeric = Number(valueField);
  return { keyword, value: Number.isFinite(numeric) ? numeric : valueField };
}

function parseFitsString(field: string): string {
  const open = field.indexOf("'");
  if (open === -1) return '';
  let i = open + 1;
  let out = '';
  while (i < field.length) {
    const ch = field[i]!;
    if (ch === "'") {
      if (field[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      break;
    }
    out += ch;
    i += 1;
  }
  return out.trimEnd();
}

function bytesToAscii(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += String.fromCharCode(bytes[i]!);
  }
  return s;
}
