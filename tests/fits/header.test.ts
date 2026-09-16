import { describe, expect, it } from 'vitest';
import { parseFitsHeader } from '../../src/fits/header';
import { buildFitsBuffer } from './_helpers';

describe('parseFitsHeader', () => {
  it('reads simple string, numeric, and logical values', () => {
    const buffer = buildFitsBuffer([
      ['SIMPLE', true],
      ['BITPIX', 16],
      ['FILTER', 'L'],
      ['EXPTIME', 180.0],
    ]);

    const header = parseFitsHeader(buffer);

    expect(header['SIMPLE']).toBe(true);
    expect(header['BITPIX']).toBe(16);
    expect(header['FILTER']).toBe('L');
    expect(header['EXPTIME']).toBe(180.0);
  });

  it('uppercases keywords for case-insensitive lookup', () => {
    const buffer = buildFitsBuffer([['filter', 'Ha']]);
    const header = parseFitsHeader(buffer);
    expect(header['FILTER']).toBe('Ha');
  });

  it('unescapes doubled single quotes inside a string value', () => {
    const buffer = buildFitsBuffer([['OBJECT', "It's a star"]]);
    const header = parseFitsHeader(buffer);
    expect(header['OBJECT']).toBe("It's a star");
  });

  it('stops reading at the END card and ignores trailing bytes', () => {
    const cards: Array<[string, string | number | boolean]> = [['EXPTIME', 60.0]];
    const head = buildFitsBuffer(cards);
    const junk =
      "AFTERWRD= 'should be ignored' / junk after END                   " + ' '.repeat(2880 - 80);
    const combined = new Uint8Array(head.length + junk.length);
    combined.set(head, 0);
    combined.set(new TextEncoder().encode(junk), head.length);

    const header = parseFitsHeader(combined);
    expect(header['EXPTIME']).toBe(60.0);
    expect(header['AFTERWRD']).toBeUndefined();
    expect(header['END']).toBeUndefined();
  });

  it('reads past the first 2880-byte block when the header spans two', () => {
    const manyCards: Array<[string, string | number | boolean]> = [];
    for (let i = 0; i < 40; i += 1) {
      manyCards.push([`PAD${String(i).padStart(3, '0')}`, i]);
    }
    manyCards.push(['OBJCTRA', '05 35 17.3']);

    const buffer = buildFitsBuffer(manyCards);
    expect(buffer.length).toBeGreaterThan(2880);

    const header = parseFitsHeader(buffer);
    expect(header['PAD000']).toBe(0);
    expect(header['PAD035']).toBe(35);
    expect(header['PAD039']).toBe(39);
    expect(header['OBJCTRA']).toBe('05 35 17.3');
  });

  it('skips free-form comment cards with no value', () => {
    const buffer = buildFitsBuffer([
      ['COMMENT', 'captured by hand'],
      ['HISTORY', 'first light'],
      ['EXPTIME', 30.0],
    ]);
    const header = parseFitsHeader(buffer);
    expect(header['COMMENT']).toBeUndefined();
    expect(header['HISTORY']).toBeUndefined();
    expect(header['EXPTIME']).toBe(30.0);
  });

  it('returns an empty header for empty input', () => {
    expect(parseFitsHeader(new Uint8Array(0))).toEqual({});
  });

  it('returns an empty header if the input is shorter than a single card', () => {
    expect(parseFitsHeader(new Uint8Array([1, 2, 3]))).toEqual({});
  });

  it('caps reading at 5760 bytes (two records) even if END is missing', () => {
    const cards: Array<[string, string | number | boolean]> = [];
    for (let i = 0; i < 200; i += 1) {
      cards.push([`PAD${String(i).padStart(3, '0')}`, i]);
    }
    const buffer = buildFitsBuffer(cards);
    const header = parseFitsHeader(buffer);
    expect(Object.keys(header).length).toBeLessThanOrEqual(72);
  });
});
