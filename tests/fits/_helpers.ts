/**
 * Test helpers for building synthetic FITS headers. Not picked up by
 * Vitest because the filename has no `.test.ts` suffix.
 */

import { TextEncoder } from 'node:util';

export type FitsCard = readonly [string, string | number | boolean];

const RECORD_BYTES = 2880;
const CARD_BYTES = 80;
const END_CARD = 'END' + ' '.repeat(CARD_BYTES - 3);

export function buildFitsBuffer(cards: readonly FitsCard[], extraPadding = 0): Uint8Array {
  const body = cards.map((card) => formatCard(card[0], card[1])).join('');
  const totalContent = body.length + END_CARD.length + extraPadding;
  const paddedLen = Math.ceil(totalContent / RECORD_BYTES) * RECORD_BYTES;
  const padding = ' '.repeat(Math.max(0, paddedLen - totalContent));
  return new TextEncoder().encode(body + END_CARD + padding);
}

export function formatCard(key: string, value: string | number | boolean): string {
  const upper = key.toUpperCase();
  if (upper === 'COMMENT' || upper === 'HISTORY') {
    const text = String(value).slice(0, CARD_BYTES - 8);
    return (upper.padEnd(8, ' ') + text).padEnd(CARD_BYTES, ' ');
  }
  const name = upper.slice(0, 8).padEnd(8);
  let v: string;
  if (typeof value === 'boolean') {
    v = value ? 'T' : 'F';
  } else if (typeof value === 'number') {
    v = String(value);
  } else {
    v = `'${value.replace(/'/g, "''")}'`;
  }
  const card = `${name}= ${v}`;
  if (card.length > CARD_BYTES) {
    throw new Error(`FITS card too long (${card.length}): ${card}`);
  }
  return card.padEnd(CARD_BYTES);
}
