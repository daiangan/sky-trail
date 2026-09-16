import { describe, expect, it } from 'vitest';
import { readLightBlob } from '../../src/fits/file';
import { buildFitsBuffer, type FitsCard } from './_helpers';

const CARDS: FitsCard[] = [
  ['DATE-OBS', '2026-01-15T20:03:00'],
  ['EXPTIME', 180.0],
  ['FILTER', 'L'],
  ['OBJCTRA', '05 35 17.3'],
  ['OBJCTDEC', '-05 23 28'],
  ['SITELAT', '40.000000'],
  ['SITELONG', '-3.700000'],
];

describe('readLightBlob', () => {
  it('reads only the header slice and reports the full blob size', async () => {
    const headerBytes = buildFitsBuffer(CARDS);
    const pixelPadding = 8 * 1024 * 1024;
    const blob = new Blob([headerBytes, new Uint8Array(pixelPadding)], {
      type: 'application/fits',
    });

    const info = await readLightBlob(blob);

    expect(info.sizeBytes).toBe(headerBytes.byteLength + pixelPadding);
    expect(info.dateObs).toBe('2026-01-15T20:03:00');
    expect(info.exptime).toBe(180.0);
    expect(info.filterName).toBe('L');
    expect(info.objRaDeg).toBeCloseTo(83.822, 2);
    expect(info.objDecDeg).toBeCloseTo(-5.391, 2);
    expect(info.siteLatDeg).toBe(40.0);
    expect(info.siteLonDeg).toBe(-3.7);
  });

  it('handles a header that spans two 2880-byte blocks', async () => {
    const cards: FitsCard[] = [];
    for (let i = 0; i < 40; i += 1) {
      cards.push([`PAD${String(i).padStart(3, '0')}`, i]);
    }
    cards.push(['EXPTIME', 90.0], ['FILTER', 'R']);
    const blob = new Blob([buildFitsBuffer(cards), new Uint8Array(1024)], {
      type: 'application/fits',
    });

    const info = await readLightBlob(blob);

    expect(info.exptime).toBe(90.0);
    expect(info.filterName).toBe('R');
  });
});
