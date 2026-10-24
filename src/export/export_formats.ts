/**
 * The video shapes and sizes the export dialog offers. Pure maths, so the
 * sizes can be tested without a browser: each format fixes an aspect ratio,
 * and the quality picks the length of the short side.
 */

export type ExportFormatId = 'vertical' | 'portrait' | 'square' | 'landscape' | 'window';
export type ExportQualityId = 'hd' | 'standard';

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  /** What it is for, shown under the label. */
  hint: string;
  /** Width divided by height; null for "same as the window". */
  aspect: number | null;
}

export interface ExportQuality {
  id: ExportQualityId;
  label: string;
  hint: string;
  /** Length of the shorter side, in pixels. */
  shortSide: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { id: 'vertical', label: '9:16', hint: 'Reels, TikTok, Shorts', aspect: 9 / 16 },
  { id: 'portrait', label: '4:5', hint: 'Instagram feed', aspect: 4 / 5 },
  { id: 'square', label: '1:1', hint: 'Square', aspect: 1 },
  { id: 'landscape', label: '16:9', hint: 'YouTube, screens', aspect: 16 / 9 },
  { id: 'window', label: 'Window', hint: 'As it looks now', aspect: null },
];

export const EXPORT_QUALITIES: readonly ExportQuality[] = [
  { id: 'hd', label: '1080p', hint: 'Sharper, larger file', shortSide: 1080 },
  { id: 'standard', label: '720p', hint: 'Lighter, faster to share', shortSide: 720 },
];

export const DEFAULT_EXPORT_FORMAT: ExportFormatId = 'vertical';
export const DEFAULT_EXPORT_QUALITY: ExportQualityId = 'hd';

/** The overlay layout is drawn on a canvas this wide (in CSS pixels) and then scaled up. */
const OVERLAY_LOGICAL_WIDTH_LANDSCAPE = 960;
const OVERLAY_LOGICAL_WIDTH_UPRIGHT = 540;

/** Encoders want even dimensions. */
function even(n: number): number {
  return Math.max(2, Math.ceil(n / 2) * 2);
}

export function findFormat(id: ExportFormatId): ExportFormat {
  return EXPORT_FORMATS.find((f) => f.id === id) ?? EXPORT_FORMATS[0]!;
}

export function findQuality(id: ExportQualityId): ExportQuality {
  return EXPORT_QUALITIES.find((q) => q.id === id) ?? EXPORT_QUALITIES[0]!;
}

/** Output size in pixels. "Window" keeps the on-screen size and ignores the quality. */
export function exportSize(
  formatId: ExportFormatId,
  qualityId: ExportQualityId,
  windowSize: PixelSize,
): PixelSize {
  const { aspect } = findFormat(formatId);
  if (aspect === null) return { width: even(windowSize.width), height: even(windowSize.height) };
  const short = findQuality(qualityId).shortSide;
  return aspect >= 1
    ? { width: even(short * aspect), height: short }
    : { width: short, height: even(short / aspect) };
}

/**
 * How much to scale the overlay drawing. Fixed shapes lay the overlays out on a
 * canvas of a fixed logical width, so they look the same at 720p and 1080p;
 * "window" keeps the on-screen layout.
 */
export function overlayScale(
  formatId: ExportFormatId,
  size: PixelSize,
  windowClientWidth: number,
): number {
  if (findFormat(formatId).aspect === null) {
    return Math.max(1, size.width / Math.max(1, windowClientWidth));
  }
  const logical =
    size.width >= size.height ? OVERLAY_LOGICAL_WIDTH_LANDSCAPE : OVERLAY_LOGICAL_WIDTH_UPRIGHT;
  return size.width / logical;
}

/** Export runs in real time: the reveal at the arc speed, plus the final hold. */
export function estimateExportSeconds(
  timelineLength: number,
  pointsPerSecond: number,
  finalHoldSeconds: number,
): number {
  const reveal = pointsPerSecond > 0 ? timelineLength / pointsPerSecond : 0;
  return Math.max(1, reveal + finalHoldSeconds);
}

/** "45 s", "1 min 12 s". */
export function formatExportDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
