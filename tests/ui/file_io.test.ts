import { describe, expect, it } from 'vitest';
import { hasFitsExtension } from '../../src/ui/file_io';

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
