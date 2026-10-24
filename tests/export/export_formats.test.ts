import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMATS,
  estimateExportSeconds,
  exportSize,
  fitInBox,
  formatExportDuration,
  overlayScale,
} from '../../src/export/export_formats';

const win = { width: 1301, height: 777 };

describe('exportSize', () => {
  it('gives the standard social sizes at 1080p', () => {
    expect(exportSize('vertical', 'hd', win)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize('portrait', 'hd', win)).toEqual({ width: 1080, height: 1350 });
    expect(exportSize('square', 'hd', win)).toEqual({ width: 1080, height: 1080 });
    expect(exportSize('landscape', 'hd', win)).toEqual({ width: 1920, height: 1080 });
  });

  it('scales the same shapes down at 720p', () => {
    expect(exportSize('vertical', 'standard', win)).toEqual({ width: 720, height: 1280 });
    expect(exportSize('portrait', 'standard', win)).toEqual({ width: 720, height: 900 });
    expect(exportSize('landscape', 'standard', win)).toEqual({ width: 1280, height: 720 });
  });

  it('keeps the window size, made even, and ignores the quality', () => {
    expect(exportSize('window', 'hd', win)).toEqual({ width: 1302, height: 778 });
    expect(exportSize('window', 'standard', win)).toEqual({ width: 1302, height: 778 });
  });

  it('always yields even dimensions', () => {
    for (const format of EXPORT_FORMATS) {
      for (const quality of ['hd', 'standard'] as const) {
        const { width, height } = exportSize(format.id, quality, win);
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
      }
    }
  });
});

describe('overlayScale', () => {
  it('lays upright shapes out on the same logical canvas at any quality', () => {
    const hd = overlayScale('vertical', { width: 1080, height: 1920 }, 900);
    const sd = overlayScale('vertical', { width: 720, height: 1280 }, 900);
    expect(hd).toBe(2);
    expect(hd / sd).toBeCloseTo(1080 / 720);
  });

  it('uses a wider logical canvas for landscape', () => {
    expect(overlayScale('landscape', { width: 1920, height: 1080 }, 900)).toBe(2);
  });

  it('keeps the on-screen layout for the window format, never shrinking it', () => {
    expect(overlayScale('window', { width: 1800, height: 900 }, 900)).toBe(2);
    expect(overlayScale('window', { width: 600, height: 900 }, 900)).toBe(1);
  });
});

describe('export duration', () => {
  it('adds the final hold to the reveal and never goes below a second', () => {
    expect(estimateExportSeconds(100, 5, 2)).toBe(22);
    expect(estimateExportSeconds(0, 5, 0)).toBe(1);
    expect(estimateExportSeconds(100, 0, 2)).toBe(2);
  });

  it('formats seconds and minutes', () => {
    expect(formatExportDuration(22)).toBe('22 s');
    expect(formatExportDuration(60)).toBe('1 min');
    expect(formatExportDuration(72.4)).toBe('1 min 12 s');
  });
});

describe('fitInBox', () => {
  it('fits a tall shape by its height and a wide one by its width', () => {
    expect(fitInBox(9 / 16, 220, 330)).toEqual({ width: 186, height: 330 });
    expect(fitInBox(16 / 9, 220, 330)).toEqual({ width: 220, height: 124 });
  });

  it('fills the box for the shape of the box itself and fits a square by its short side', () => {
    expect(fitInBox(220 / 330, 220, 330)).toEqual({ width: 220, height: 330 });
    expect(fitInBox(1, 220, 330)).toEqual({ width: 220, height: 220 });
  });

  it('treats a nonsense shape as square', () => {
    expect(fitInBox(0, 100, 100)).toEqual({ width: 100, height: 100 });
  });
});
