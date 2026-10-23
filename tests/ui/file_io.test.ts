import { describe, expect, it } from 'vitest';
import { hasFitsExtension, isReadableFits, readLightBatches } from '../../src/ui/file_io';
import { buildFitsBuffer } from '../fits/_helpers';

describe('hasFitsExtension', () => {
  it('accepts the .fit / .fits / .fts extensions case-insensitively', () => {
    expect(hasFitsExtension('light.FIT')).toBe(true);
    expect(hasFitsExtension('light.Fits')).toBe(true);
    expect(hasFitsExtension('light.FTS')).toBe(true);
    expect(hasFitsExtension('light.fit')).toBe(true);
  });

  it('rejects non-FITS extensions', () => {
    expect(hasFitsExtension('light.png')).toBe(false);
    expect(hasFitsExtension('light.jpg')).toBe(false);
    expect(hasFitsExtension('light.cr2')).toBe(false);
    expect(hasFitsExtension('light')).toBe(false);
    expect(hasFitsExtension('')).toBe(false);
  });

  it('rejects files where FITS appears in the middle of the name', () => {
    expect(hasFitsExtension('my.fits.bak')).toBe(false);
    expect(hasFitsExtension('fitting-room.jpg')).toBe(false);
  });

  it('handles files with directory paths in front', () => {
    expect(hasFitsExtension('session_01/light_0001.fits')).toBe(true);
    expect(hasFitsExtension('/Users/daiangan/light.FIT')).toBe(true);
  });
});

describe('isReadableFits', () => {
  it('accepts FITS files and rejects the hidden ._ companions macOS leaves on some drives', () => {
    expect(isReadableFits('Light_001.fits')).toBe(true);
    expect(isReadableFits('night1/Light_001.FIT')).toBe(true);
    expect(isReadableFits('._Light_001.fits')).toBe(false);
    expect(isReadableFits('night1/._Light_001.fits')).toBe(false);
    expect(isReadableFits('notes.txt')).toBe(false);
  });
});

describe('readLightBatches', () => {
  const header = (name: string, exptime: number) =>
    new File(
      [
        buildFitsBuffer([
          ['EXPTIME', exptime],
          ['DATE-OBS', '2026-01-01T20:00:00'],
        ]),
      ],
      name,
    );

  it('returns one result per file in the order given and reports progress', async () => {
    const files = [header('a.fits', 10), header('b.fits', 20), header('c.fits', 30)];
    const progress: number[] = [];
    const infos = await readLightBatches(files, {
      onProgress: (current) => progress.push(current),
    });
    expect(infos.map((i) => i.exptime)).toEqual([10, 20, 30]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLightBatches([header('a.fits', 10)], { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
